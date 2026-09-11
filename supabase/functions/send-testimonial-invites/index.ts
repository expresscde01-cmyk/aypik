import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  escapeHtml,
  getPublicSiteUrl,
  wrapTransactionalEmailHtml,
} from "../_shared/email.ts";
import {
  emailT,
  localizedSiteUrl,
  profileEmailLocale,
  type EmailLocale,
} from "../_shared/i18n.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type InviteRow = {
  user_id: string;
  email: string;
  display_name: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!isAuthorizedCron(req)) {
      return json({ error: "Non autorisé" }, 401);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json({ error: "RESEND_API_KEY manquante côté serveur" }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin.rpc(
      "list_testimonial_invite_candidates",
      { p_limit: 40 },
    );

    if (error) {
      return json({ error: error.message }, 500);
    }

    const candidates = Array.isArray(data) ? (data as InviteRow[]) : [];
    const siteUrl = getPublicSiteUrl();
    const from = Deno.env.get("RESEND_FROM_EMAIL") ??
      "Aypik <onboarding@resend.dev>";

    let sent = 0;
    let failed = 0;

    for (const row of candidates) {
      if (!row?.email || !row?.user_id) continue;

      const locale = await profileEmailLocale(admin, row.user_id);
      const formUrl = `${localizedSiteUrl(locale, "/", siteUrl).replace(/\/$/, "")}/?open=temoignage`;

      const html = wrapTransactionalEmailHtml({
        title: emailT(locale, "testimonialTitle"),
        siteUrl,
        bodyHtml: buildInviteBody({
          displayName: row.display_name || "Membre",
          formUrl,
          locale,
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
          to: [row.email],
          subject: emailT(locale, "testimonialSubject"),
          html,
        }),
      });

      if (!resendRes.ok) {
        failed += 1;
        const resendData = await resendRes.json().catch(() => ({}));
        console.error(
          "testimonial invite failed",
          row.user_id,
          resendData,
        );
        continue;
      }

      const { error: markError } = await admin.rpc(
        "mark_testimonial_invite_sent",
        { p_user_id: row.user_id },
      );
      if (markError) {
        console.error("mark_testimonial_invite_sent", markError.message);
      }
      sent += 1;
    }

    return json({
      ok: true,
      candidates: candidates.length,
      sent,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return json({ error: message }, 500);
  }
});

function isAuthorizedCron(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const auth = req.headers.get("Authorization")?.trim() ?? "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";

  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (cronSecret && (bearer === cronSecret || headerSecret === cronSecret)) {
    return true;
  }
  if (serviceKey && bearer === serviceKey) {
    return true;
  }
  return false;
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildInviteBody(params: {
  displayName: string;
  formUrl: string;
  locale: EmailLocale;
}) {
  const name = escapeHtml(params.displayName);
  const formUrl = escapeHtml(params.formUrl);
  const locale = params.locale;

  return `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">${emailT(locale, "testimonialHeading")}</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                ${emailT(locale, "testimonialHello", { name })}
              </p>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                ${emailT(locale, "testimonialBody1")}
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                ${emailT(locale, "testimonialBody2")}
              </p>
              <p style="margin:0 0 24px;">
                <a href="${formUrl}" style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:14px;">
                  ${emailT(locale, "testimonialCta")}
                </a>
              </p>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.55;">
                ${emailT(locale, "testimonialFooter")}
              </p>`;
}
