import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  escapeHtml,
  getPublicSiteUrl,
  buildPasswordRecoveryPageUrl,
  buildUnsubscribeUrl,
  sendResendEmail,
  wrapTransactionalEmailHtml,
} from "../_shared/email.ts";

/**
 * Auth "Send Email" hook — remplace le mailer natif de Supabase pour TOUS
 * les e-mails d'authentification (inscription, connexion, réinitialisation,
 * changement d'e-mail, réauthentification, notifications de sécurité).
 *
 * Tout part désormais via Resend, en français, sous l'expéditeur bonjour@aypik.fr
 * (RESEND_FROM_EMAIL), au lieu du mailer natif Supabase (noreply@).
 *
 * Sécurité : la requête est signée par Supabase via le secret configuré
 * dans Auth Hooks (format "v1,whsec_..."), vérifié avec standardwebhooks.
 */

type EmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type?: string;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
  old_phone?: string;
  provider?: string;
  factor_type?: string;
};

type HookUser = {
  id?: string;
  email?: string;
  new_email?: string;
  phone?: string;
  new_phone?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!hookSecretRaw) {
    console.error("auth-email-hook: SEND_EMAIL_HOOK_SECRET manquant");
    return errorResponse(500, "SEND_EMAIL_HOOK_SECRET manquant côté serveur");
  }
  if (!resendKey) {
    console.error("auth-email-hook: RESEND_API_KEY manquante");
    return errorResponse(500, "RESEND_API_KEY manquante côté serveur");
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let verified: { user: HookUser; email_data: EmailData };
  try {
    const hookSecret = hookSecretRaw.replace("v1,whsec_", "");
    const wh = new Webhook(hookSecret);
    verified = wh.verify(payload, headers) as {
      user: HookUser;
      email_data: EmailData;
    };
  } catch (err) {
    console.error("auth-email-hook: signature invalide", err);
    return errorResponse(401, "Signature webhook invalide");
  }

  const { user, email_data } = verified;
  const actionType = email_data.email_action_type || "";
  const siteUrl = getPublicSiteUrl();
  const unsubscribeUrl = user.id ? await buildUnsubscribeUrl(user.id) : null;
  const unsubHeaders = unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  try {
    switch (actionType) {
      case "signup":
      case "email": {
        const url = buildVerifyUrl(email_data, "signup", siteUrl);
        await sendOrThrow(
          resendKey,
          user.email,
          "Confirme ton adresse e-mail - Aypik",
          wrapTransactionalEmailHtml({
            title: "Confirme ton adresse e-mail",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Confirme ton adresse e-mail</h2>
              <p>Merci pour ton inscription sur Aypik !</p>
              <p>Pour activer ton compte et confirmer que cette adresse e-mail t'appartient, utilise le bouton ci-dessous.</p>
              ${authButton(url, "Confirmer mon adresse e-mail")}
              <p>Si tu n'es pas à l'origine de cette inscription, ignore cet e-mail.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      case "invite": {
        const url = buildVerifyUrl(email_data, "invite", siteUrl);
        await sendOrThrow(
          resendKey,
          user.email,
          "Confirme ton inscription - Aypik",
          wrapTransactionalEmailHtml({
            title: "Confirme ton inscription",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Confirme ton inscription</h2>
              <p>Tu es invité·e à créer un compte sur Aypik.</p>
              <p>Pour confirmer ton inscription et activer ton compte, utilise le bouton ci-dessous.</p>
              ${authButton(url, "Confirmer mon inscription")}
              <p>Si tu ne connais pas l'origine de cette invitation, ignore cet e-mail.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      case "magiclink": {
        const url = buildVerifyUrl(email_data, "magiclink", siteUrl);
        await sendOrThrow(
          resendKey,
          user.email,
          "Ton lien de connexion - Aypik",
          wrapTransactionalEmailHtml({
            title: "Connexion à Aypik",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Connexion à Aypik</h2>
              <p>Tu as demandé à te connecter à ton compte Aypik.</p>
              <p>Pour te connecter, utilise le bouton ci-dessous.</p>
              ${authButton(url, "Me connecter")}
              <p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      case "recovery": {
        const tokenHash = email_data.token_hash || "";
        const url = buildPasswordRecoveryPageUrl(tokenHash, siteUrl);
        await sendOrThrow(
          resendKey,
          user.email,
          "Réinitialisation de ton mot de passe",
          wrapTransactionalEmailHtml({
            title: "Réinitialisation de ton mot de passe",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <p>Bonjour,</p>
              <p>Tu as demandé à réinitialiser ton mot de passe. Choisis-en un nouveau avec le bouton ci-dessous.</p>
              ${authButton(url, "Choisir un nouveau mot de passe")}
              <p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      case "reauthentication": {
        await sendOrThrow(
          resendKey,
          user.email,
          "Confirme ton identité - Aypik",
          wrapTransactionalEmailHtml({
            title: "Confirme ton identité",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Confirme ton identité</h2>
              <p>Pour poursuivre cette action sensible sur ton compte Aypik, confirme ton identité.</p>
              <p>Voici ton code de vérification :</p>
              <p><strong>${escapeHtml(email_data.token || "")}</strong></p>
              <p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      case "email_change": {
        await handleEmailChange(resendKey, user, email_data, siteUrl, unsubscribeUrl, unsubHeaders);
        break;
      }
      case "password_changed_notification": {
        const wasLocked = await wasAccountLocked(user.id);
        if (wasLocked) {
          await sendOrThrow(
            resendKey,
            user.email,
            "Ton compte Aypik est de nouveau accessible",
            wrapTransactionalEmailHtml({
              title: "Ton compte Aypik est de nouveau accessible",
              siteUrl,
              unsubscribeUrl,
              bodyHtml: `
                <h2>Ton compte Aypik est de nouveau accessible</h2>
                <p>Bonne nouvelle : ton compte Aypik est de nouveau accessible.</p>
                <p>Le blocage temporaire lié à plusieurs tentatives de connexion infructueuses a été levé, et ton nouveau mot de passe est actif.</p>
                <p>Tu peux te reconnecter dès maintenant.</p>
              `,
            }),
            unsubHeaders,
          );
        } else {
          await sendOrThrow(
            resendKey,
            user.email,
            "Ton mot de passe a été modifié",
            wrapTransactionalEmailHtml({
              title: "Ton mot de passe a été modifié",
              siteUrl,
              unsubscribeUrl,
              bodyHtml: `
                <h2>Ton mot de passe a été modifié</h2>
                <p>Le mot de passe de ton compte Aypik vient d'être modifié.</p>
                <p>Si tu n'es pas à l'origine de cette modification, réinitialise ton mot de passe et contacte le support immédiatement.</p>
              `,
            }),
            unsubHeaders,
          );
        }
        break;
      }
      case "email_changed_notification": {
        const oldEmail = email_data.old_email || "";
        const newEmail = user.email || "";
        await sendOrThrow(
          resendKey,
          newEmail,
          "Ton adresse e-mail a été modifiée",
          wrapTransactionalEmailHtml({
            title: "Ton adresse e-mail a été modifiée",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Ton adresse e-mail a été modifiée</h2>
              <p>L'adresse e-mail de ton compte Aypik a été changée de ${escapeHtml(oldEmail)} vers ${escapeHtml(newEmail)}.</p>
              <p>Si tu n'es pas à l'origine de cette modification, contacte le support immédiatement.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      case "phone_changed_notification": {
        const oldPhone = email_data.old_phone || "";
        const newPhone = user.phone || "";
        await sendOrThrow(
          resendKey,
          user.email,
          "Ton numéro de téléphone a été modifié",
          wrapTransactionalEmailHtml({
            title: "Ton numéro de téléphone a été modifié",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Ton numéro de téléphone a été modifié</h2>
              <p>Le numéro de téléphone de ton compte Aypik a été changé de ${escapeHtml(oldPhone)} vers ${escapeHtml(newPhone)}.</p>
              <p>Si tu n'es pas à l'origine de cette modification, contacte le support immédiatement.</p>
            `,
          }),
          unsubHeaders,
        );
        break;
      }
      default: {
        // Type non explicitement géré (ex : notifications désactivées côté
        // dashboard mais réactivées plus tard). On envoie un e-mail générique
        // plutôt que d'échouer silencieusement.
        console.warn("auth-email-hook: type non géré, envoi générique", actionType);
        const url = email_data.token_hash
          ? buildVerifyUrl(email_data, actionType || "signup", siteUrl)
          : null;
        await sendOrThrow(
          resendKey,
          user.email,
          "Notification Aypik",
          wrapTransactionalEmailHtml({
            title: "Notification Aypik",
            siteUrl,
            unsubscribeUrl,
            bodyHtml: `
              <h2>Notification de ton compte Aypik</h2>
              <p>Une action a été effectuée sur ton compte Aypik.</p>
              ${url ? authButton(url, "Continuer") : ""}
              <p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
            `,
          }),
          unsubHeaders,
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur d'envoi";
    console.error("auth-email-hook: échec envoi", actionType, message);
    return errorResponse(500, message);
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function authButton(href: string, label: string): string {
  return `<p style="margin:0 0 16px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#f59e0b);color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:14px;">${label}</a></p>`;
}

function buildVerifyUrl(
  emailData: EmailData,
  fallbackType: string,
  siteUrl: string,
): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const tokenHash = emailData.token_hash || "";
  const type = emailData.email_action_type || fallbackType;
  const redirectTo = emailData.redirect_to || siteUrl;
  const params = new URLSearchParams({
    token: tokenHash,
    type,
    redirect_to: redirectTo,
  });
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

async function handleEmailChange(
  resendKey: string,
  user: HookUser,
  emailData: EmailData,
  siteUrl: string,
  unsubscribeUrl: string | null,
  unsubHeaders?: Record<string, string>,
) {
  const subject = "Confirme le changement d'adresse e-mail - Aypik";
  const newEmail = user.new_email || "";
  const currentEmail = user.email || "";

  const buildBody = (tokenHash: string) =>
    wrapTransactionalEmailHtml({
      title: "Confirme le changement d'adresse e-mail",
      siteUrl,
      unsubscribeUrl,
      bodyHtml: `
        <h2>Confirme le changement d'adresse e-mail</h2>
        <p>Tu as demandé à changer l'adresse e-mail de ton compte Aypik vers ${escapeHtml(newEmail)}.</p>
        <p>Pour confirmer ce changement, utilise le bouton ci-dessous.</p>
        ${authButton(
          buildVerifyUrl({ ...emailData, token_hash: tokenHash }, "email_change", siteUrl),
          "Confirmer le changement",
        )}
        <p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>
      `,
    });

  // "Secure Email Change" activé : deux OTP sont générés (noms inversés
  // par compatibilité ascendante côté Supabase) :
  //  - token_hash_new → à utiliser avec l'adresse ACTUELLE (user.email)
  //  - token_hash     → à utiliser avec la NOUVELLE adresse (user.new_email)
  const secureMode = Boolean(emailData.token_hash_new);

  if (secureMode) {
    if (currentEmail && emailData.token_hash_new) {
      await sendOrThrow(resendKey, currentEmail, subject, buildBody(emailData.token_hash_new), unsubHeaders);
    }
    if (newEmail && emailData.token_hash) {
      await sendOrThrow(resendKey, newEmail, subject, buildBody(emailData.token_hash), unsubHeaders);
    }
    return;
  }

  // Mode simple : un seul OTP, un seul e-mail vers la nouvelle adresse.
  const tokenHash = emailData.token_hash || emailData.token_hash_new || "";
  const target = newEmail || currentEmail;
  if (target && tokenHash) {
    await sendOrThrow(resendKey, target, subject, buildBody(tokenHash), unsubHeaders);
  }
}

async function sendOrThrow(
  resendKey: string,
  to: string | undefined,
  subject: string,
  html: string,
  headers?: Record<string, string>,
) {
  if (!to) {
    throw new Error("Destinataire manquant pour l'envoi de l'e-mail");
  }
  const sent = await sendResendEmail({ resendKey, to, subject, html, headers });
  if (!sent.ok) throw new Error(sent.error);
}

/**
 * Vérifie si le compte était verrouillé (login_security.locked_at) au moment
 * où ce changement de mot de passe est survenu — permet de distinguer un
 * reset volontaire ("mot de passe oublié") d'un déblocage suite à un
 * verrouillage pour tentatives de connexion échouées, sans nouvelle
 * mécanique côté frontend ou edge function dédiée.
 */
async function wasAccountLocked(userId?: string): Promise<boolean> {
  if (!userId) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return false;

  try {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin
      .from("login_security")
      .select("locked_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("auth-email-hook: lecture login_security échouée", error.message);
      return false;
    }
    return Boolean(data?.locked_at);
  } catch (err) {
    console.error("auth-email-hook: wasAccountLocked a échoué", err);
    return false;
  }
}

function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: { http_code: status, message } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
