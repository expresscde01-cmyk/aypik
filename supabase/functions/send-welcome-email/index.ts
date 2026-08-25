import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  escapeHtml,
  isEmailNotificationsEnabled,
  wrapTransactionalEmailHtml,
} from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WelcomePayload = {
  displayName?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json({ error: "RESEND_API_KEY manquante côté serveur" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return json({ error: "Session invalide" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select(
        "is_founder, founder_number, founder_premium_until, welcome_email_sent_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return json({ error: membershipError.message }, 500);
    }

    if (!membership?.is_founder) {
      return json({ error: "Offre Fondateur requise", skipped: true }, 403);
    }

    if (membership.welcome_email_sent_at) {
      return json({ ok: true, alreadySent: true });
    }

    const allowed = await isEmailNotificationsEnabled(admin, user.id);
    if (!allowed) {
      return json({
        ok: true,
        skipped: true,
        skippedReason: "email_notifications_disabled",
      });
    }

    let body: WelcomePayload = {};
    try {
      body = (await req.json()) as WelcomePayload;
    } catch {
      body = {};
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const displayName =
      (typeof body.displayName === "string" && body.displayName.trim()) ||
      profile?.display_name ||
      "Membre Fondateur";

    const founderNumber =
      typeof membership.founder_number === "number"
        ? membership.founder_number
        : null;

    const premiumUntil = membership.founder_premium_until
      ? new Date(membership.founder_premium_until).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      : null;

    const from =
      Deno.env.get("RESEND_FROM_EMAIL") ??
      "Aypik <onboarding@resend.dev>";

    const subject = founderNumber
      ? `Bienvenue sur Aypik — Membre Fondateur #${founderNumber}`
      : "Bienvenue sur Aypik — Membre Fondateur";

    const html = wrapTransactionalEmailHtml({
      title: "Bienvenue sur Aypik",
      bodyHtml: buildWelcomeBody({
        displayName,
        founderNumber,
        premiumUntil,
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
        to: [user.email],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      const message =
        typeof resendData?.message === "string"
          ? resendData.message
          : "Échec d'envoi Resend";
      return json({ error: message }, 502);
    }

    await admin
      .from("memberships")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return json({
      ok: true,
      id: resendData?.id ?? null,
      alreadySent: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return json({ error: message }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildWelcomeBody(params: {
  displayName: string;
  founderNumber: number | null;
  premiumUntil: string | null;
}) {
  const name = escapeHtml(params.displayName);
  const numberLabel =
    typeof params.founderNumber === "number"
      ? `#${params.founderNumber}`
      : "Fondateur";
  const until = params.premiumUntil
    ? `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">Tes 6 mois Premium offerts sont actifs jusqu'au <strong>${escapeHtml(params.premiumUntil)}</strong>.</p>`
    : `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">Tes 6 mois Premium offerts sont maintenant actifs.</p>`;

  return `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">Bienvenue, ${name}&nbsp;!</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                Tu fais partie des 500 premiers membres. Ton statut
                <strong>Membre Fondateur ${escapeHtml(numberLabel)}</strong>
                est confirmé à vie. Likes illimités, flash et boost de
                visibilité du profil offert pendant le premier mois.
              </p>
              ${until}
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                Aucune carte bancaire n'est requise. À l'issue de cette période,
                les avantages fonctionnels prennent fin ; ton badge Membre
                Fondateur reste visible. Sans tacite reconduction.
              </p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Belle découverte sur Aypik — un espace atypique réservé
                exclusivement aux personnes sans enfants.
              </p>`;
}
