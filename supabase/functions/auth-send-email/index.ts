/**
 * Hook Auth « Send Email » : n’envoie aucun e-mail recovery.
 * generateLink crée le token ; Resend (login-security) envoie le modèle A ou B.
 *
 * Dashboard : Authentication → Hooks → Send Email
 * URL : https://<project>.supabase.co/functions/v1/auth-send-email
 * Secret : SEND_EMAIL_HOOK_SECRET (même valeur que le secret du hook)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";

type EmailHookPayload = {
  email_data?: {
    email_action_type?: string;
  };
};

function hookSecret(): string | null {
  const raw = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.trim();
  if (!raw) return null;
  return raw.replace("v1,whsec_", "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  const payload = await req.text();
  const secret = hookSecret();
  if (secret) {
    try {
      const wh = new Webhook(secret);
      wh.verify(payload, Object.fromEntries(req.headers));
    } catch (err) {
      const message = err instanceof Error ? err.message : "signature invalide";
      console.error("auth-send-email webhook", message);
      return json({ error: message }, 401);
    }
  }

  let action = "";
  try {
    const parsed = JSON.parse(payload) as EmailHookPayload;
    action = (parsed.email_data?.email_action_type || "").trim();
  } catch {
    action = "";
  }

  console.info("auth-send-email swallowed", action || "unknown");
  return json({});
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
