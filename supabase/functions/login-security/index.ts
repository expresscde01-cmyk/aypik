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
    const msg = link.error.toLowerCase();
    if (
      msg.includes("not found") ||
      msg.includes("unable to find") ||
      msg.includes("user not found")
    ) {
      return json({ ok: true, skipped: true });
    }
    console.error("login-security reset link", link.error);
    return json({ error: link.error }, 502);
  }

  const sent = await sendResendEmail({
    resendKey,
    to: email,
    subject: PASSWORD_RESET_SUBJECT,
    html: buildPasswordResetEmailHtml(link.url),
  });
  if (!sent.ok) {
    console.error("login-security resend", sent.error);
    return json({ error: sent.error }, 502);
  }

  return json({ ok: true, emailed: true, id: sent.id });
}

async function handleNotifyLock(
  admin: SupabaseClient,
  resendKey: string,
  email: string,
) {
  const { data, error } = await admin.rpc("login_security_lock_payload", {
    p_email: email,
  });
  if (error) return json({ error: error.message }, 500);

  const row = (data || {}) as {
    ok?: boolean;
    error?: string;
    user_id?: string;
    email?: string;
    display_name?: string;
    lock_email_sent_at?: string | null;
  };

  if (!row.ok || !row.user_id || !row.email) {
    return json({
      ok: true,
      skipped: true,
      skippedReason: row.error || "not_locked",
    });
  }

  await admin.auth.admin.signOut(row.user_id, "global");

  if (row.lock_email_sent_at) {
    return json({ ok: true, alreadySent: true });
  }

  const link = await createRecoveryLink(admin, row.email);
  if ("error" in link) return json({ error: link.error }, 502);

  

  const sent = await sendResendEmail({
    resendKey,
    to: row.email,
    subject: ACCOUNT_UNLOCK_SUBJECT,
    html: buildAccountUnlockEmailHtml(link.url),
  });
  if (!sent.ok) return json({ error: sent.error }, 502);

  await admin.rpc("mark_login_lock_email_sent", { p_user: row.user_id });

  return json({
    ok: true,
    emailed: true,
    id: sent.id,
  });

}

function invalidCredentialsResponse() {
  return json(
    { code: "invalid_credentials", message: "Invalid login credentials" },
    400,
  );
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

  const dummyPromise = dummyPasswordCheck(password).catch(() => {});
  const authPromise = anon.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captchaToken || undefined },
  });
  const [{ data, error }] = await Promise.all([authPromise, dummyPromise]);

  if (error) {
    if (isGoTrueInvalidCredentials(error)) {
      return invalidCredentialsResponse();
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
  if (!session?.access_token || !session?.refresh_token) {
    return invalidCredentialsResponse();
  }

  return json({
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
