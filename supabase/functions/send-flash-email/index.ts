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

type FlashEmailPayload = {
  notificationId?: string;
  flashId?: string;
  toUserId?: string;
  fromDisplayName?: string;
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
    if (userError || !user) {
      return json({ error: "Session invalide" }, 401);
    }

    let body: FlashEmailPayload = {};
    try {
      body = (await req.json()) as FlashEmailPayload;
    } catch {
      body = {};
    }

    const notificationId = body.notificationId?.trim();
    const flashId = body.flashId?.trim();
    const toUserId = body.toUserId?.trim();

    if (!notificationId || !flashId || !toUserId) {
      return json({ error: "Paramètres manquants" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: flash, error: flashError } = await admin
      .from("flashes")
      .select("id, from_user, to_user")
      .eq("id", flashId)
      .maybeSingle();

    if (flashError) return json({ error: flashError.message }, 500);
    if (!flash || flash.from_user !== user.id || flash.to_user !== toUserId) {
      return json({ error: "Flash introuvable" }, 403);
    }

    const { data: notif, error: notifError } = await admin
      .from("social_notifications")
      .select("id, user_id, kind, email_sent_at, actor_id")
      .eq("id", notificationId)
      .maybeSingle();

    if (notifError) return json({ error: notifError.message }, 500);
    if (
      !notif ||
      notif.kind !== "flash_received" ||
      notif.user_id !== toUserId ||
      notif.actor_id !== user.id
    ) {
      return json({ error: "Notification introuvable" }, 403);
    }

    if (notif.email_sent_at) {
      return json({ ok: true, alreadySent: true });
    }

    const allowed = await isEmailNotificationsEnabled(admin, toUserId);
    if (!allowed) {
      return json({
        ok: true,
        skipped: true,
        skippedReason: "email_notifications_disabled",
      });
    }

    const { data: recipientAuth, error: recipientError } = await admin.auth
      .admin.getUserById(toUserId);

    if (recipientError || !recipientAuth?.user?.email) {
      return json({
        ok: false,
        skipped: true,
        error: "E-mail destinataire indisponible",
      }, 200);
    }

    const { data: actorProfile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const fromDisplayName =
      (typeof body.fromDisplayName === "string" &&
        body.fromDisplayName.trim()) ||
      actorProfile?.display_name ||
      "Quelqu’un";

    const from =
      Deno.env.get("RESEND_FROM_EMAIL") ??
      "Aypik <onboarding@resend.dev>";

    const subject =
      `${fromDisplayName} vous a envoyé un coup de cœur sur Aypik`;
    const html = wrapTransactionalEmailHtml({
      title: "Coup de cœur Aypik",
      bodyHtml: buildFlashBody({ fromDisplayName }),
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipientAuth.user.email],
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

    await admin.rpc("mark_flash_notification_emailed", {
      p_notification_id: notificationId,
    });

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

function buildFlashBody(params: { fromDisplayName: string }) {
  const name = escapeHtml(params.fromDisplayName);
  return `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">Vous avez reçu un coup de cœur&nbsp;!</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                <strong>${name}</strong> vous a flashé sur Aypik.
                Connectez-vous pour découvrir ce profil et répondre si le feeling est réciproque.
              </p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Belle découverte — un espace bienveillant réservé exclusivement aux personnes sans enfants.
              </p>`;
}
