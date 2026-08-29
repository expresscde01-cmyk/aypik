import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  escapeHtml,
  isEmailNotificationsEnabled,
  sendResendEmail,
  wrapTransactionalEmailHtml,
} from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-aypik-email-secret",
};

type SocialKind = "flash_received" | "like_received" | "match_created";

type Payload = {
  notificationId?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const hookSecret = Deno.env.get("EMAIL_HOOK_SECRET")?.trim();
    const provided = req.headers.get("x-aypik-email-secret")?.trim();
    if (!hookSecret || !provided || provided !== hookSecret) {
      return json({ error: "Non autorisé" }, 401);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json({ error: "RESEND_API_KEY manquante côté serveur" }, 500);
    }

    let body: Payload = {};
    try {
      body = (await req.json()) as Payload;
    } catch {
      body = {};
    }

    const notificationId = body.notificationId?.trim();
    if (!notificationId) {
      return json({ error: "Paramètres manquants" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: notif, error: notifError } = await admin
      .from("social_notifications")
      .select("id, user_id, kind, title, body, email_sent_at, actor_id, flash_id")
      .eq("id", notificationId)
      .maybeSingle();

    if (notifError) return json({ error: notifError.message }, 500);
    if (!notif) return json({ error: "Notification introuvable" }, 404);

    const kind = notif.kind as SocialKind;
    if (
      kind !== "flash_received" &&
      kind !== "like_received" &&
      kind !== "match_created"
    ) {
      return json({
        ok: true,
        skipped: true,
        skippedReason: "unsupported_kind",
      });
    }

    if (notif.email_sent_at) {
      return json({ ok: true, alreadySent: true });
    }

    const allowed = await isEmailNotificationsEnabled(admin, notif.user_id);
    if (!allowed) {
      return json({
        ok: true,
        skipped: true,
        skippedReason: "email_notifications_disabled",
      });
    }

    const { data: recipientAuth, error: recipientError } = await admin.auth
      .admin.getUserById(notif.user_id);

    if (recipientError || !recipientAuth?.user?.email) {
      return json({
        ok: false,
        skipped: true,
        error: "E-mail destinataire indisponible",
      }, 200);
    }

    let actorName = "Quelqu’un";
    if (notif.actor_id) {
      const { data: actorProfile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", notif.actor_id)
        .maybeSingle();
      if (actorProfile?.display_name?.trim()) {
        actorName = actorProfile.display_name.trim();
      }
    }

    const { subject, title, bodyHtml } = buildSocialEmail({
      kind,
      actorName,
      notifTitle: typeof notif.title === "string" ? notif.title : "",
      notifBody: typeof notif.body === "string" ? notif.body : "",
    });

    const html = wrapTransactionalEmailHtml({
      title,
      bodyHtml,
    });

    const sent = await sendResendEmail({
      resendKey,
      to: recipientAuth.user.email,
      subject,
      html,
    });

    if (!sent.ok) {
      return json({ error: sent.error }, 502);
    }

    await admin.rpc("mark_notification_emailed", {
      p_notification_id: notificationId,
    });

    return json({
      ok: true,
      id: sent.id,
      alreadySent: false,
      kind,
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

function buildSocialEmail(params: {
  kind: SocialKind;
  actorName: string;
  notifTitle: string;
  notifBody: string;
}): { subject: string; title: string; bodyHtml: string } {
  const name = escapeHtml(params.actorName);

  if (params.kind === "flash_received") {
    return {
      subject: `${params.actorName} t'a envoyé un Flash sur Aypik`,
      title: "Flash Aypik",
      bodyHtml: `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">Tu as reçu un Flash&nbsp;!</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                <strong>${name}</strong> t'a envoyé un Flash ⚡ sur Aypik.
                Connecte-toi pour découvrir ce profil et répondre si le feeling est réciproque.
              </p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Belle découverte — un lieu d'échange atypique réservé exclusivement aux personnes sans enfants.
              </p>`,
    };
  }

  if (params.kind === "like_received") {
    return {
      subject: `${params.actorName} t'a envoyé un Like sur Aypik`,
      title: "Like Aypik",
      bodyHtml: `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">Tu as reçu un Like&nbsp;!</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                <strong>${name}</strong> t'a envoyé un Like ❤️ sur Aypik.
                Connecte-toi pour voir ce profil — le Like reste discret jusqu'à un match.
              </p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Belle découverte — un lieu d'échange atypique réservé exclusivement aux personnes sans enfants.
              </p>`,
    };
  }

  // match_created
  const isAcceptorCopy =
    params.notifTitle === "Matché le" ||
    params.notifBody === "Matché le";

  if (isAcceptorCopy) {
    return {
      subject: "C’est un match sur Aypik",
      title: "Match Aypik",
      bodyHtml: `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">C’est un match&nbsp;!</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                Tu as matché avec <strong>${name}</strong> sur Aypik.
                Connecte-toi pour démarrer la conversation.
              </p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Belle découverte — un lieu d'échange atypique réservé exclusivement aux personnes sans enfants.
              </p>`,
    };
  }

  const flashOrigin = /flash/i.test(params.notifBody);
  return {
    subject: flashOrigin
      ? `${params.actorName} a matché ton Flash sur Aypik`
      : `${params.actorName} a matché ton Like sur Aypik`,
    title: "Match Aypik",
    bodyHtml: `
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-weight:800;color:#f97316;">Aypik</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">C’est un match&nbsp;!</h1>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                <strong>${name}</strong> ${
                  flashOrigin
                    ? "a matché ton Flash ⚡"
                    : "a matché ton Like ❤️"
                } sur Aypik.
                Connecte-toi pour démarrer la conversation.
              </p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Belle découverte — un lieu d'échange atypique réservé exclusivement aux personnes sans enfants.
              </p>`,
  };
}
