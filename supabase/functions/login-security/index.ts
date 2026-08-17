import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildPasswordRecoveryPageUrl,
  buildPasswordResetEmailHtml,
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

type Payload = {
  action?: string;
  email?: string;
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

  const displayName = escapeHtml(row.display_name || "toi");
  const html = wrapTransactionalEmailHtml({
    title: "Compte bloqué pour des raisons de sécurité",
    bodyHtml: `
        <p style="margin:0 0 12px;color:#e11d48;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Sécurité</p>
        <h1 style="margin:0 0 16px;color:#111827;font-size:22px;line-height:1.3;">Ton compte Aypik a été bloqué</h1>
        <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
          Bonjour ${displayName},
        </p>
        <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
          Nous avons détecté <strong>4 tentatives de connexion infructueuses</strong> consécutives
          sur ton compte. Par mesure de sécurité, la connexion est bloquée.
        </p>
        <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
          Pour débloquer ton compte, choisis un nouveau mot de passe via ce lien sécurisé.
          Si tu n’es pas à l’origine de ces tentatives, ce changement protège aussi ton compte.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(link.url)}" style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:14px;">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.55;">
          Ce lien est valable pendant une durée limitée. Tu peux aussi utiliser
          « Mot de passe oublié ? » sur la page de connexion.
        </p>
      `,
  });

  const sent = await sendResendEmail({
    resendKey,
    to: row.email,
    subject: "Aypik — Ton compte a été bloqué pour des raisons de sécurité",
    html,
  });
  if (!sent.ok) return json({ error: sent.error }, 502);

  await admin.rpc("mark_login_lock_email_sent", { p_user: row.user_id });

  return json({
    ok: true,
    emailed: true,
    id: sent.id,
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
