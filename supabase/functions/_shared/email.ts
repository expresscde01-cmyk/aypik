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

/** Lien de reset hébergé sur le site (évite les Redirect URLs Auth). */
export function buildPasswordRecoveryPageUrl(
  tokenHash: string,
  siteUrl = getPublicSiteUrl(),
): string {
  const url = new URL(siteUrl);
  url.searchParams.set("reset", "1");
  url.searchParams.set("type", "recovery");
  url.searchParams.set("token_hash", tokenHash);
  return url.toString();
}

export function preferencesUrl(siteUrl = getPublicSiteUrl()): string {
  return `${siteUrl}/?open=preferences`;
}

/** HMAC-SHA256(secret, message), retourne un hex complet (64 caractères). */
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Lien de désabonnement en un clic (RFC 8058) : ne nécessite pas de connexion,
 * pointe directement vers l'edge function `unsubscribe` qui désactive
 * `profiles.email_notifications_enabled` pour cet utilisateur.
 * Retourne `null` si UNSUBSCRIBE_SECRET n'est pas configuré (pas de lien signé possible).
 */
export async function buildUnsubscribeUrl(userId: string): Promise<string | null> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!secret || !userId) return null;
  const sig = (await hmacHex(secret, userId)).slice(0, 32);
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const params = new URLSearchParams({ u: userId, s: sig });
  return `${base}/functions/v1/unsubscribe?${params.toString()}`;
}

/** Vérifie la signature d'un lien de désabonnement (comparaison en temps constant). */
export async function verifyUnsubscribeSignature(
  userId: string,
  sig: string,
): Promise<boolean> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!secret || !userId || !sig) return false;
  const expected = (await hmacHex(secret, userId)).slice(0, 32);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
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

const AUTH_EMAIL_BUTTON_STYLE =
  "display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:14px;";

function authEmailButton(href: string, label: string): string {
  return `<p style="margin:0 0 16px;"><a href="${href}" style="${AUTH_EMAIL_BUTTON_STYLE}">${label}</a></p>`;
}

export const PASSWORD_RESET_SUBJECT = "Réinitialisation de ton mot de passe";

export function buildPasswordResetBodyHtml(resetUrl: string): string {
  const url = escapeHtml(resetUrl);
  return `
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Bonjour,</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Tu as demandé à réinitialiser ton mot de passe. Choisis-en un nouveau avec le bouton ci-dessous.
    </p>
    ${authEmailButton(url, "Choisir un nouveau mot de passe")}
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.
    </p>
  `;
}
export const ACCOUNT_UNLOCK_SUBJECT = "Déblocage de ton compte Aypik";

export function buildAccountUnlockBodyHtml(unlockUrl: string): string {
  const url = escapeHtml(unlockUrl);
  return `
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Bonjour,</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Ton compte a été temporairement bloqué pour des raisons de sécurité. Débloque-le avec le bouton ci-dessous.
    </p>
    ${authEmailButton(url, "Débloquer mon compte")}
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.
    </p>
  `;
}

export function buildAccountUnlockEmailHtml(
  unlockUrl: string,
  siteUrl = getPublicSiteUrl(),
  unsubscribeUrl?: string | null,
): string {
  return wrapTransactionalEmailHtml({
    title: ACCOUNT_UNLOCK_SUBJECT,
    siteUrl,
    unsubscribeUrl,
    bodyHtml: buildAccountUnlockBodyHtml(unlockUrl),
  });
}
export function buildPasswordResetEmailHtml(
  resetUrl: string,
  siteUrl = getPublicSiteUrl(),
  unsubscribeUrl?: string | null,
): string {
  return wrapTransactionalEmailHtml({
    title: PASSWORD_RESET_SUBJECT,
    siteUrl,
    unsubscribeUrl,
    bodyHtml: buildPasswordResetBodyHtml(resetUrl),
  });
}

export async function sendResendEmail(params: {
  resendKey: string;
  to: string;
  subject: string;
  html: string;
  /** En-têtes additionnels transmis tels quels à Resend (ex: List-Unsubscribe). */
  headers?: Record<string, string>;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const from =
    Deno.env.get("RESEND_FROM_EMAIL") ?? "Aypik <onboarding@resend.dev>";
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.headers ? { headers: params.headers } : {}),
    }),
  });
  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    const raw =
      typeof resendData?.message === "string"
        ? resendData.message
        : "Échec d'envoi Resend";
    const testingOnly = /only send testing emails to your own/i.test(raw);
    return {
      ok: false,
      error: testingOnly
        ? "Resend est en mode test : vérifie le domaine d'expéditeur (RESEND_FROM_EMAIL) ou n'envoie qu'à l'e-mail du compte Resend."
        : raw,
    };
  }
  return {
    ok: true,
    id: typeof resendData?.id === "string" ? resendData.id : null,
  };
}

/**
 * Pied de page légal + liens de gestion (tous les e-mails sortants).
 * `unsubscribeUrl` : lien réel de désabonnement en un clic (voir buildUnsubscribeUrl).
 * S'il est absent, on retombe sur la page de préférences (comportement précédent).
 */
export function buildEmailLegalFooter(
  siteUrl = getPublicSiteUrl(),
  unsubscribeUrl?: string | null,
): string {
  const prefs = escapeHtml(preferencesUrl(siteUrl));
  const unsub = escapeHtml(unsubscribeUrl || preferencesUrl(siteUrl));
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
    <a href="${unsub}" style="color:#e11d48;text-decoration:underline;">
      Désactiver les notifications par e-mail
    </a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">
    Conformément au RGPD et à la réglementation applicable, tu peux à tout moment
    désactiver les e-mails de notification depuis ta page de profil Aypik
    (section Préférences) ou via le lien de désabonnement ci-dessus. Les e-mails
    strictement nécessaires au fonctionnement du service (sécurité, facturation)
    peuvent rester envoyés le cas échéant.
  </p>`;
}

/**
 * Enveloppe le contenu HTML d’un e-mail Aypik avec le footer légal.
 */
export function wrapTransactionalEmailHtml(params: {
  title: string;
  bodyHtml: string;
  siteUrl?: string;
  /** Lien de désabonnement en un clic ; à défaut, retombe sur la page de préférences. */
  unsubscribeUrl?: string | null;
}): string {
  const siteUrl = params.siteUrl ?? getPublicSiteUrl();
  const title = escapeHtml(params.title);
  const footer = buildEmailLegalFooter(siteUrl, params.unsubscribeUrl);

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
