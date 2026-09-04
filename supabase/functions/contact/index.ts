import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  escapeHtml,
  wrapTransactionalEmailHtml,
} from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = "aypik.contact@gmail.com";

const CATEGORY_LABELS: Record<string, string> = {
  general: "Question générale",
  technical: "Problème technique",
  report: "Signalement",
  other: "Autre",
};

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  category?: unknown;
  message?: unknown;
  consent?: unknown;
  captchaToken?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée", code: "validation_failed" }, 405);
  }

  try {
    let body: ContactPayload = {};
    try {
      body = (await req.json()) as ContactPayload;
    } catch {
      return json({ error: "Requête invalide", code: "validation_failed" }, 400);
    }

    const name = trimString(body.name, 80);
    const email = trimString(body.email, 254).toLowerCase();
    const category = trimString(body.category, 32);
    const message = trimString(body.message, 4000);
    const consent = body.consent === true;
    const captchaToken = trimString(body.captchaToken, 2048);

    if (!name || !email || !category || !message || !consent) {
      return json(
        { error: "Champs requis manquants", code: "validation_failed" },
        400,
      );
    }
    if (!EMAIL_RE.test(email) || !CATEGORY_LABELS[category]) {
      return json(
        { error: "Informations invalides", code: "validation_failed" },
        400,
      );
    }

    const captchaOk = await verifyTurnstile(captchaToken, clientIp(req));
    if (!captchaOk) {
      return json(
        { error: "CAPTCHA invalide ou expiré", code: "captcha_failed" },
        400,
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("contact: RESEND_API_KEY manquante");
      return json(
        { error: "Envoi indisponible", code: "send_failed" },
        503,
      );
    }

    const categoryLabel = CATEGORY_LABELS[category];
    const to = Deno.env.get("CONTACT_TO_EMAIL")?.trim() || SUPPORT_EMAIL;
    const from =
      Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
      "Aypik <onboarding@resend.dev>";
    const subject = `[Aypik] ${categoryLabel} — ${name}`;
    const html = wrapTransactionalEmailHtml({
      title: "Nouveau message de contact",
      bodyHtml: buildContactBody({
        name,
        email,
        categoryLabel,
        message,
      }),
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject,
        html,
      }),
    });

    const resendData = (await resendRes.json().catch(() => ({}))) as {
      id?: unknown;
      message?: unknown;
    };
    const resendId =
      typeof resendData.id === "string" && resendData.id.trim()
        ? resendData.id.trim()
        : "";
    const resendMessage =
      typeof resendData.message === "string" ? resendData.message : null;

    console.log(
      JSON.stringify({
        event: "contact_resend",
        status: resendRes.status,
        ok: resendRes.ok,
        id: resendId || null,
        from,
        to,
        error: resendMessage,
      }),
    );

    if (!resendRes.ok || !resendId) {
      console.error(
        "contact: Resend a refusé ou n'a pas confirmé l'envoi",
        resendRes.status,
        resendMessage,
      );
      return json({ error: "Envoi indisponible", code: "send_failed" }, 502);
    }

    return json({ ok: true, id: resendId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Erreur serveur";
    console.error("contact:", detail);
    return json({ error: "Envoi indisponible", code: "send_failed" }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trimString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
  return req.headers.get("cf-connecting-ip")?.trim() || undefined;
}

async function verifyTurnstile(
  token: string,
  ip: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim();
  if (!secret) {
    console.error("contact: TURNSTILE_SECRET_KEY manquante");
    return false;
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
  );
  const data = (await res.json().catch(() => null)) as
    | { success?: boolean }
    | null;
  return data?.success === true;
}

function buildContactBody(params: {
  name: string;
  email: string;
  categoryLabel: string;
  message: string;
}): string {
  const name = escapeHtml(params.name);
  const email = escapeHtml(params.email);
  const category = escapeHtml(params.categoryLabel);
  const message = escapeHtml(params.message).replace(/\r\n|\r|\n/g, "<br>");

  return `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">Nouveau message de contact</h1>
              <p style="margin:0 0 8px;color:#4b5563;font-size:15px;line-height:1.6;"><strong>Nom :</strong> ${name}</p>
              <p style="margin:0 0 8px;color:#4b5563;font-size:15px;line-height:1.6;"><strong>E-mail (répondre à) :</strong> <a href="mailto:${email}">${email}</a></p>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;"><strong>Sujet :</strong> ${category}</p>
              <p style="margin:0;color:#111827;font-size:15px;line-height:1.7;">${message}</p>`;
}
