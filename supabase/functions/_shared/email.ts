/**
 * Utilitaires partagés pour les e-mails transactionnels Resend.
 * À importer depuis les Edge Functions : `../_shared/email.ts`
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function getPublicSiteUrl(): string {
  const raw =
    Deno.env.get("PUBLIC_SITE_URL")?.trim() ||
    Deno.env.get("SITE_URL")?.trim() ||
    "https://aypik.fr";
  return raw.replace(/\/$/, "");
}

export function preferencesUrl(siteUrl = getPublicSiteUrl()): string {
  return `${siteUrl}/?open=preferences`;
}

/**
 * Vérifie si le destinataire autorise les e-mails de notification.
 * Absence de ligne / null → true (opt-out explicite uniquement).
 */
export async function isEmailNotificationsEnabled(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("email_notifications_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("email_notifications_enabled lookup failed", error.message);
    // En cas d'erreur de lecture, on n'envoie pas (précaution).
    return false;
  }

  if (!data) return true;
  return data.email_notifications_enabled !== false;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Pied de page légal + lien de gestion des préférences (tous les e-mails sortants). */
export function buildEmailLegalFooter(siteUrl = getPublicSiteUrl()): string {
  const prefs = escapeHtml(preferencesUrl(siteUrl));
  const home = escapeHtml(siteUrl);

  return `
  <hr style="border:none;border-top:1px solid #fce7f3;margin:28px 0 16px;" />
  <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;line-height:1.55;">
    Tu reçois cet e-mail car tu as un compte sur
    <a href="${home}" style="color:#e11d48;text-decoration:underline;">Aypik</a>.
  </p>
  <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;line-height:1.55;">
    <a href="${prefs}" style="color:#e11d48;text-decoration:underline;">
      Gérer mes préférences depuis mon profil
    </a>
    &nbsp;·&nbsp;
    <a href="${prefs}" style="color:#e11d48;text-decoration:underline;">
      Désactiver les notifications par e-mail
    </a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">
    Conformément au RGPD et à la réglementation applicable, vous pouvez à tout moment
    désactiver les e-mails de notification depuis votre page de profil Aypik
    (section Préférences). Les e-mails strictement nécessaires au fonctionnement du
    service (sécurité, facturation) peuvent rester envoyés le cas échéant.
  </p>`;
}

/**
 * Enveloppe le contenu HTML d’un e-mail Aypik avec le footer légal.
 */
export function wrapTransactionalEmailHtml(params: {
  title: string;
  bodyHtml: string;
  siteUrl?: string;
}): string {
  const siteUrl = params.siteUrl ?? getPublicSiteUrl();
  const title = escapeHtml(params.title);
  const footer = buildEmailLegalFooter(siteUrl);

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><title>${title}</title></head>
<body style="margin:0;padding:0;background:#fff7f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #ffe4e6;border-radius:24px;padding:32px;">
          <tr>
            <td>
              ${params.bodyHtml}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
