import { escapeHtml } from "./email.ts";
import {
  emailT,
  localizedPreferencesUrl,
  type EmailLocale,
} from "./i18n.ts";

const LOGO_GRADIENT =
  "linear-gradient(90deg,#B8125F 0%,#CE0E5E 35%,#DE063C 60%,#EC3C0E 85%,#F26A0A 100%)";

export type TransactionalEmailParams = {
  title: string;
  bodyHtml: string;
  siteUrl?: string;
  unsubscribeUrl?: string | null;
  locale?: EmailLocale;
};

function siteOrigin(siteUrl?: string): string {
  const raw = (siteUrl || "https://aypik.fr").trim() || "https://aypik.fr";
  return raw.replace(/\/$/, "");
}

/** Bouton d'action : dégradé du logo, secours uni #DE063C pour Outlook. */
export function emailActionButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;"><tr><td align="center" bgcolor="#DE063C" style="border-radius:14px;background-color:#DE063C;background-image:${LOGO_GRADIENT};"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:320px;" arcsize="29%" strokecolor="#DE063C" fillcolor="#DE063C"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${safeLabel}</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="${safeHref}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:14px;background-color:#DE063C;background-image:${LOGO_GRADIENT};">${safeLabel}</a><!--<![endif]--></td></tr></table>`;
}

function footerHtml(
  locale: EmailLocale,
  origin: string,
  unsubscribeUrl?: string | null,
): string {
  const prefs = escapeHtml(localizedPreferencesUrl(locale, origin));
  const disableHref = escapeHtml(unsubscribeUrl || localizedPreferencesUrl(locale, origin));
  return `
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #E3E5EA;color:#8A90A2;font-size:13px;line-height:1.55;">${emailT(locale, "legalFooterAccount")}</p>
    <p style="margin:12px 0 0;font-size:13px;line-height:1.55;">
      <a href="${prefs}" style="color:#9F1239;text-decoration:underline;">${emailT(locale, "legalFooterManagePrefs")}</a>
      &nbsp;&nbsp;
      <a href="${disableHref}" style="color:#9F1239;text-decoration:underline;">${emailT(locale, "legalFooterDisable")}</a>
    </p>
    <p style="margin:12px 0 0;color:#8A90A2;font-size:12px;line-height:1.55;">${emailT(locale, "legalFooterRgpd")}</p>`;
}

/** Logo typographique (PNG : les messageries n'affichent pas le SVG). */
export function emailWordmarkHtml(origin: string, width = 300): string {
  const src = escapeHtml(`${origin.replace(/\/$/, "")}/aypik-nom.png`);
  const height = Math.round((width * 722) / 3464);
  const margin = width >= 240 ? "0 auto 20px" : "0 0 8px";
  return `<img src="${src}" width="${width}" height="${height}" alt="Aypik" style="display:block;margin:${margin};border:0;outline:none;text-decoration:none;max-width:100%;height:auto;" />`;
}

/** Gabarit commun : fond crème, cœur, carte blanche, pied de page. */
export function wrapTransactionalEmailHtml(params: TransactionalEmailParams): string {
  const locale = params.locale ?? "fr";
  const origin = siteOrigin(params.siteUrl);
  const logo = escapeHtml(`${origin}/aypik-email-coeur-fond-creme.png`);
  const title = escapeHtml(params.title);
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    h1, h2, p { margin: 0 0 16px; color: #1C2340; }
    h1, h2 { font-size: 20px; line-height: 1.3; font-weight: 700; }
    p { font-size: 16px; line-height: 1.55; }
    a { color: #9F1239; }
  </style>
</head>
<body style="margin:0;padding:0;background:#FFF6EE;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFF6EE;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <img src="${logo}" width="112" height="99" alt="" style="display:block;margin:0 auto 8px;border:0;outline:none;text-decoration:none;" />
        ${emailWordmarkHtml(origin, 300)}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #E3E5EA;border-radius:16px;">
          <tr>
            <td style="padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;color:#1C2340;font-size:16px;line-height:1.55;text-align:left;">
              ${params.bodyHtml}
              ${footerHtml(locale, origin, params.unsubscribeUrl)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
