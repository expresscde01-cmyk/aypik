import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * E-mails applicatifs (Resend) — séparés des e-mails Auth Supabase.
 *
 * Secrets (Supabase Edge Function env) :
 * - RESEND_API_KEY
 * - RESEND_FROM_EMAIL  (ex. "Aypik <bonjour@votredomaine.fr>")
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type TemplateId =
  | "welcome_founder"
  | "welcome_freemium"
  | "welcome_profile"
  | "product_alert"
  | "community_alert"
  | "generic";

type EmailBody = {
  to?: string;
  template?: TemplateId;
  subject?: string;
  data?: Record<string, string | number | boolean | null>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(data: EmailBody["data"], key: string, fallback = ""): string {
  const v = data?.[key];
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function renderTemplate(
  template: TemplateId,
  data: EmailBody["data"]
): { subject: string; html: string; text: string } {
  const name = str(data, "displayName", "membre");
  const title = str(data, "title");
  const body = str(data, "body");
  const ctaUrl = str(data, "ctaUrl", "");
  const ctaLabel = str(data, "ctaLabel", "Ouvrir Aypik");

  const wrap = (inner: string) =>
    `<div style="font-family:Georgia,serif;line-height:1.55;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
      <p style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#e11d48;font-weight:700;margin:0 0 12px">Aypik</p>
      ${inner}
      <p style="margin-top:28px;font-size:12px;color:#9ca3af">Cet e-mail est envoyé par Aypik. Les e-mails de connexion restent gérés séparément.</p>
    </div>`;

  switch (template) {
    case "welcome_founder":
    case "welcome_profile":
      return {
        subject: "Bienvenue chez Aypik — Membre Fondateur",
        html: wrap(`
          <h1 style="font-size:24px;margin:0 0 12px;color:#111827">Bienvenue${name ? `, ${name}` : ""} 👋</h1>
          <p>Votre inscription Fondateur est finalisée. Profitez de l’accès complet : matching, messages, filtres et likes illimités.</p>
          <p>Vous faites partie des 500 premiers — merci de construire Aypik avec nous.</p>
          ${ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">${ctaLabel}</a></p>` : ""}
        `),
        text: `Bienvenue${name ? `, ${name}` : ""} sur Aypik. Votre inscription Fondateur est finalisée.`,
      };
    case "welcome_freemium":
      return {
        subject: "Bienvenue sur Aypik",
        html: wrap(`
          <h1 style="font-size:24px;margin:0 0 12px;color:#111827">Bienvenue${name ? `, ${name}` : ""}</h1>
          <p>Votre profil est prêt. Explorez les rencontres et les messages quand vous voulez.</p>
        `),
        text: `Bienvenue${name ? `, ${name}` : ""} sur Aypik. Votre profil est prêt.`,
      };
    case "product_alert":
      return {
        subject: title || "Nouvelle actualité Aypik",
        html: wrap(`
          <h1 style="font-size:22px;margin:0 0 12px;color:#111827">${title || "Actualité"}</h1>
          <p>${body || "Une nouveauté est disponible sur Aypik."}</p>
          ${ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">${ctaLabel}</a></p>` : ""}
        `),
        text: `${title || "Actualité Aypik"}\n\n${body}`,
      };
    case "community_alert":
      return {
        subject: title || "Message de la communauté Aypik",
        html: wrap(`
          <h1 style="font-size:22px;margin:0 0 12px;color:#111827">${title || "Communauté"}</h1>
          <p>${body || "Un message de la communauté Aypik."}</p>
          ${ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">${ctaLabel}</a></p>` : ""}
        `),
        text: `${title || "Communauté Aypik"}\n\n${body}`,
      };
    default:
      return {
        subject: title || "Message Aypik",
        html: wrap(`
          <h1 style="font-size:22px;margin:0 0 12px;color:#111827">${title || "Aypik"}</h1>
          <p>${body || ""}</p>
        `),
        text: `${title || "Aypik"}\n\n${body}`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("RESEND_FROM_EMAIL") || "Aypik <onboarding@resend.dev>";

    if (!resendKey) {
      return json(
        {
          error:
            "Resend n'est pas configuré (secret RESEND_API_KEY manquant sur la Edge Function).",
        },
        503
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return json({ error: "Session invalide" }, 401);
    }

    const payload = (await req.json()) as EmailBody;
    const template = (payload.template || "generic") as TemplateId;
    const to = (payload.to || user.email).trim().toLowerCase();

    // Un utilisateur ne peut envoyer qu’à lui-même depuis le client
    // (les campagnes admin passeront plus tard par service role).
    if (to !== user.email.trim().toLowerCase()) {
      return json(
        { error: "Destinataire non autorisé pour cet appel client." },
        403
      );
    }

    const rendered = renderTemplate(template, {
      ...payload.data,
      displayName:
        payload.data?.displayName ??
        user.user_metadata?.display_name ??
        user.email.split("@")[0],
    });

    const subject = payload.subject?.trim() || rendered.subject;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });

    const resendJson = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return json(
        {
          error:
            typeof resendJson?.message === "string"
              ? resendJson.message
              : "Échec d’envoi Resend",
          details: resendJson,
        },
        502
      );
    }

    return json({
      ok: true,
      id: typeof resendJson?.id === "string" ? resendJson.id : undefined,
      provider: "resend",
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : "email_send_failed",
      },
      500
    );
  }
});
