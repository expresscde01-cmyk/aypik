import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs";
import {
  buildPasswordRecoveryPageUrl,
  buildPasswordResetEmailHtml,
  buildAccountUnlockEmailHtml,
  ACCOUNT_UNLOCK_SUBJECT,
  escapeHtml,
  getPublicSiteUrl,
  PASSWORD_RESET_SUBJECT,
  sendResendEmail,
  wrapTransactionalEmailHtml,
} from "../_shared/email.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** bcrypt cost 10 (défaut GoTrue). Résultat de compare ignoré — égalise le timing. */
const DUMMY_PASSWORD_HASH =
  "$2a$10$D5grTTzcsqyvAeIAnY/mYOIqliCoG7eAMX0/oFcuD.iErkksEbcAa";

type Payload = {
  action?: string;
  email?: string;
  password?: string;
  captchaToken?: string;
  redirectTo?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: Payload = {};
    try {
      body = (await req.json()) as Payload;
    } catch {
      body = {};
    }

    const action = (body.action || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json({ error: "E-mail invalide" }, 400);
    }

    if (action === "sign_in") {
      return await handleSignIn(
        email,
        body.password || "",
        body.captchaToken,
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("login-security RESEND_API_KEY manquante");
      return json({ error: "RESEND_API_KEY manquante côté serveur" }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "reset_password") {
      return await handlePasswordReset(admin, resendKey, email);
    }
    if (action === "notify_lock") {
      return await handleNotifyLock(admin, resendKey, email);
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return json({ error: message }, 500);
  }
});

function recoveryUrlFromGenerateLink(params: {
  action_link?: string;
  hashed_token?: string;
  verification_type?: string;
}): string | null {
  const siteUrl = getPublicSiteUrl();
  if (params.hashed_token) {
    return buildPasswordRecoveryPageUrl(params.hashed_token, siteUrl);
  }
  if (!params.action_link) return null;
  try {
    const generated = new URL(params.action_link);
    const token =
      generated.searchParams.get("token") ||
      generated.searchParams.get("token_hash");
    if (token) return buildPasswordRecoveryPageUrl(token, siteUrl);
  } catch {
    /* lien Auth brut en dernier recours */
  }
  return params.action_link;
}

function isUnknownUserMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("unable to find") ||
    msg.includes("user not found")
  );
}

async function createRecoveryLink(
  admin: SupabaseClient,
  email: string,
): Promise<{ url: string } | { error: string }> {
  const siteUrl = getPublicSiteUrl();
  const safeRedirect = `${siteUrl}/?reset=1`;

  const attempts: Array<{
    type: "recovery";
    email: string;
    options?: { redirectTo: string };
  }> = [
    { type: "recovery", email, options: { redirectTo: safeRedirect } },
    { type: "recovery", email },
  ];

  let lastError = "Impossible de créer le lien de réinitialisation";

  for (const params of attempts) {
    const { data, error } = await admin.auth.admin.generateLink(params);
    const props = (data?.properties || data || {}) as {
      action_link?: string;
      hashed_token?: string;
      verification_type?: string;
    };

    const resetUrl = recoveryUrlFromGenerateLink(props);
    if (resetUrl) {
      if (error?.message) {
        console.error("login-security generateLink mailer", error.message);
      }
      return { url: resetUrl };
    }

    if (error?.message) {
      lastError = error.message;
      console.error("login-security generateLink", error.message);
      if (isUnknownUserMessage(error.message)) {
        return { error: error.message };
      }
    }
  }

  return { error: lastError };
}

async function handlePasswordReset(
  admin: SupabaseClient,
  resendKey: string,
  email: string,
) {
  const link = await createRecoveryLink(admin, email);
  if ("error" in link) {
    console.error("login-security reset link", link.error);
    return json({ ok: true });
  }

  const sent = await sendResendEmail({
    resendKey,
    to: email,
    subject: PASSWORD_RESET_SUBJECT,
    html: buildPasswordResetEmailHtml(link.url),
  });
  if (!sent.ok) {
    console.error("login-security resend", sent.error);
    return json({ ok: true });
  }

  return json({ ok: true });
}

async function handleNotifyLock(
  admin: SupabaseClient,
  resendKey: string,
  email: string,
) {
  const { data, error } = await admin.rpc("login_security_lock_payload", {
    p_email: email,
  });
  if (error) {
    console.error("login-security lock_payload", error.message);
    return json({ ok: true });
  }

  const row = (data || {}) as {
    ok?: boolean;
    error?: string;
    user_id?: string;
    email?: string;
    display_name?: string;
    lock_email_sent_at?: string | null;
  };

  if (!row.ok || !row.user_id || !row.email) {
    console.error(
      "login-security notify_lock skipped",
      row.error || "not_locked",
    );
    return json({ ok: true });
  }

  await admin.auth.admin.signOut(row.user_id, "global");

  if (row.lock_email_sent_at) {
    console.error("login-security notify_lock already sent");
    return json({ ok: true });
  }

  const link = await createRecoveryLink(admin, row.email);
  if ("error" in link) {
    console.error("login-security notify_lock link", link.error);
    return json({ ok: true });
  }

  const sent = await sendResendEmail({
    resendKey,
    to: row.email,
    subject: ACCOUNT_UNLOCK_SUBJECT,
    html: buildAccountUnlockEmailHtml(link.url),
  });
  if (!sent.ok) {
    console.error("login-security notify_lock resend", sent.error);
    return json({ ok: true });
  }

  await admin.rpc("mark_login_lock_email_sent", { p_user: row.user_id });

  return json({ ok: true });
}

function invalidCredentialsResponse(extra?: {
  locked?: boolean;
  just_locked?: boolean;
}) {
  return json(
    {
      code: "invalid_credentials",
      message: "Invalid login credentials",
      ...(extra?.locked === true ? { locked: true } : {}),
      ...(extra?.just_locked === true ? { just_locked: true } : {}),
    },
    400,
  );
}

function readFailureFlags(data: unknown): {
  locked: boolean;
  just_locked: boolean;
} {
  let row = data;
  if (typeof row === "string") {
    try {
      row = JSON.parse(row) as unknown;
    } catch {
      return { locked: false, just_locked: false };
    }
  }
  if (!row || typeof row !== "object") {
    return { locked: false, just_locked: false };
  }
  const o = row as { locked?: unknown; just_locked?: unknown };
  return {
    locked: o.locked === true,
    just_locked: o.just_locked === true,
  };
}

async function recordFailureAndRespond(
  admin: SupabaseClient,
  email: string,
) {
  const { data, error } = await admin.rpc("record_login_failure", {
    p_email: email,
  });
  if (error) {
    console.error("login-security record_login_failure", error.message);
    return invalidCredentialsResponse();
  }
  const flags = readFailureFlags(data);
  return invalidCredentialsResponse({
    locked: flags.locked,
    just_locked: flags.just_locked,
  });
}

function dummyPasswordCheck(password: string): Promise<void> {
  return new Promise((resolve) => {
    bcrypt.compare(password, DUMMY_PASSWORD_HASH, () => {
      resolve();
    });
  });
}

function isGoTrueInvalidCredentials(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = (error.code || "").toLowerCase();
  const msg = (error.message || "").toLowerCase();
  return (
    code === "invalid_credentials" ||
    code === "invalid_grant" ||
    code === "invalid_login_credentials" ||
    msg.includes("invalid login credentials")
  );
}

async function handleSignIn(
  email: string,
  password: string,
  captchaToken?: string,
) {
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const dummyPromise = dummyPasswordCheck(password).catch(() => {});
  const authPromise = anon.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captchaToken || undefined },
  });
  const lockPromise = admin.rpc("login_security_status", { p_email: email });
  const [{ data, error }, , lockResult] = await Promise.all([
    authPromise,
    dummyPromise,
    lockPromise,
  ]);

  if (error) {
    if (isGoTrueInvalidCredentials(error)) {
      return await recordFailureAndRespond(admin, email);
    }
    return json(
      {
        code: error.code || "auth_error",
        message: error.message,
        error: error.message,
      },
      error.status || 400,
    );
  }

  const session = data.session;
  const locked = readLockedFlag(lockResult.data);
  const lockUnknown = Boolean(lockResult.error) || locked === null;
  if (!session?.access_token || !session?.refresh_token || lockUnknown) {
    return invalidCredentialsResponse();
  }
  if (locked === true) {
    return invalidCredentialsResponse({ locked: true });
  }

  const { error: clearError } = await admin.rpc(
    "clear_login_failures_for_email",
    { p_email: email },
  );
  if (clearError) {
    console.error(
      "login-security clear_login_failures_for_email",
      clearError.message,
    );
  }

  return json({
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

function readLockedFlag(data: unknown): boolean | null {
  let row = data;
  if (typeof row === "string") {
    try {
      row = JSON.parse(row) as unknown;
    } catch {
      return null;
    }
  }
  if (!row || typeof row !== "object") return null;
  if (!("locked" in row)) return null;
  return (row as { locked: unknown }).locked === true;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
