/**
 * Utilitaires partagés pour les e-mails transactionnels Resend.
 * À importer depuis les Edge Functions : `../_shared/email.ts`
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { emailT, type EmailLocale } from "./i18n.ts";

export function getPublicSiteUrl(): string {
  const raw =
    Deno.env.get("PUBLIC_SITE_URL")?.trim() ||
    Deno.env.get("SITE_URL")?.trim() ||
    "https://aypik.fr";
  return raw.replace(/\/$/, "");
}

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

export async function buildUnsubscribeUrl(userId: string): Promise<string | null> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!secret || !userId) return null;
  const sig = (await hmacHex(secret, userId)).slice(0, 32);
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const params = new URLSearchParams({ u: userId, s: sig });
  return `${base}/functions/v1/unsubscribe?${params.toString()}`;
}

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

export const PASSWORD_RESET_SUBJECT = "Réinitialisation de votre mot de passe";

export function buildPasswordResetBodyHtml(resetUrl: string): string {
  const url = escapeHtml(resetUrl);
  return `
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Bonjour,</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour en définir un nouveau :
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;word-break:break-all;">
      <a href="${url}">${url}</a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.
    </p>
  `;
}
export const ACCOUNT_UNLOCK_SUBJECT = "Déblocage de votre compte Aypik";

export function buildAccountUnlockBodyHtml(unlockUrl: string): string {
  const url = escapeHtml(unlockUrl);
  return `
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Bonjour,</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Votre compte a été temporairement bloqué pour des raisons de sécurité. Cliquez sur le lien ci-dessous pour le débloquer :
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;word-break:break-all;">
      <a href="${url}">${url}</a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet e-mail.
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

export function buildEmailLegalFooter(
  siteUrl = getPublicSiteUrl(),
  unsubscribeUrl?: string | null,
  locale: EmailLocale = "fr",
): string {
  const prefs = escapeHtml(preferencesUrl(siteUrl));
  const unsub = escapeHtml(unsubscribeUrl || preferencesUrl(siteUrl));

  return `
  <hr style="border:none;border-top:1px solid #fce7f3;margin:28px 0 16px;" />
  <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;line-height:1.55;">
    ${emailT(locale, "legalFooterAccount")}
  </p>
  <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;line-height:1.55;">
    <a href="${prefs}" style="color:#e11d48;text-decoration:underline;">
      ${emailT(locale, "legalFooterManagePrefs")}
    </a>
    &nbsp;·&nbsp;
    <a href="${unsub}" style="color:#e11d48;text-decoration:underline;">
      ${emailT(locale, "legalFooterDisable")}
    </a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">
    ${emailT(locale, "legalFooterRgpd")}
  </p>`;
}

export function wrapTransactionalEmailHtml(params: {
  title: string;
  bodyHtml: string;
  siteUrl?: string;
  unsubscribeUrl?: string | null;
  locale?: EmailLocale;
}): string {
  const siteUrl = params.siteUrl ?? getPublicSiteUrl();
  const title = escapeHtml(params.title);
  const locale = params.locale ?? "fr";
  const footer = buildEmailLegalFooter(siteUrl, params.unsubscribeUrl, locale);

  return `<!DOCTYPE html>
<html lang="${locale}">
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
