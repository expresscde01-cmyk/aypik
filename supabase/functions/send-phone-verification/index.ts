import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Envoi du SMS OTP (phone_change) après JWT + Turnstile + allowlist pays + quotas.
 *
 * On n’utilise PAS auth.admin.updateUserById({ phone }) : GoTrue applique
 * alors le numéro sans flux de confirmation (pas d’SMS, vérification sautée).
 * Après les contrôles, on relaie PUT /auth/v1/user avec le JWT de l’appelant
 * — même chemin SMS qu’aujourd’hui, type phone_change.
 *
 * Limite connue : un client avancé peut toujours appeler PUT /auth/v1/user
 * avec son propre JWT, en contournant cette fonction. Ce n’est pas une RPC
 * révocable. Les verrous restants sont les Geographic Permissions Twilio et
 * le plafond projet sms_sent (30 / h). Ouvrir d’autres pays progressivement,
 * pas d’un coup, même une fois cette fonction en production.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PREFIXES = "+33";
const E164_RE = /^\+[1-9]\d{6,14}$/;
const FRANCE_E164_RE = /^\+33[1-9]\d{8}$/;

type Body = {
  phone?: unknown;
  captchaToken?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true }, 200);
  }

  if (req.method !== "POST") {
    return json(
      { error: "Méthode non autorisée", code: "validation_failed" },
      405,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.trim()) {
      return json({ error: "Non authentifié", code: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("send-phone-verification: secrets Supabase manquants");
      return json(
        { error: "Envoi indisponible", code: "sms_send_failed" },
        503,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt);
    if (userError || !user) {
      return json({ error: "Session invalide", code: "unauthorized" }, 401);
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      return json({ error: "Requête invalide", code: "validation_failed" }, 400);
    }

    const captchaToken = trimString(body.captchaToken, 2048);
    const captchaOk = await verifyTurnstile(captchaToken, clientIp(req));
    if (!captchaOk) {
      return json(
        { error: "CAPTCHA invalide ou expiré", code: "captcha_failed" },
        400,
      );
    }

    const phone = trimString(body.phone, 20).replace(/[\s.-]/g, "");
    if (!E164_RE.test(phone)) {
      return json(
        { error: "Numéro de téléphone invalide", code: "validation_failed" },
        400,
      );
    }

    const prefixes = await loadAllowedPrefixes(admin);
    if (!phoneMatchesAllowlist(phone, prefixes)) {
      return json(
        {
          error: "Ce préfixe pays n’est pas encore ouvert pour la vérification par SMS.",
          code: "phone_country_not_allowed",
        },
        400,
      );
    }

    const { data: quota, error: quotaError } = await admin.rpc(
      "try_record_phone_verification_send",
      { p_user_id: user.id, p_phone_e164: phone },
    );
    if (quotaError) {
      console.error("send-phone-verification: quota rpc", quotaError.message);
      return json(
        { error: "Envoi indisponible", code: "sms_send_failed" },
        500,
      );
    }

    const quotaPayload =
      quota && typeof quota === "object"
        ? (quota as { ok?: unknown; code?: unknown })
        : {};
    if (quotaPayload.ok !== true) {
      const code =
        typeof quotaPayload.code === "string" && quotaPayload.code
          ? quotaPayload.code
          : "over_sms_send_rate_limit";
      const status = code === "validation_failed" ? 400 : 429;
      return json(
        {
          error:
            code === "over_sms_send_rate_limit"
              ? "Trop de SMS envoyés. Réessaie dans quelques heures."
              : "Numéro de téléphone invalide",
          code,
        },
        status,
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { error: updateError } = await userClient.auth.updateUser({
      phone,
    });
    if (updateError) {
      const code = updateError.code || "sms_send_failed";
      const status = code === "over_sms_send_rate_limit" ? 429 : 400;
      return json(
        { error: updateError.message, code },
        status,
      );
    }

    return json({ ok: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Erreur serveur";
    console.error("send-phone-verification:", detail);
    return json(
      { error: "Envoi indisponible", code: "sms_send_failed" },
      500,
    );
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
    console.error("send-phone-verification: TURNSTILE_SECRET_KEY manquante");
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

async function loadAllowedPrefixes(
  admin: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await admin.rpc("get_setting_text", {
    p_key: "phone_sms_country_prefixes",
    p_default: DEFAULT_PREFIXES,
  });
  if (error) {
    console.error("send-phone-verification: get_setting_text", error.message);
  }
  const raw = typeof data === "string" && data.trim() ? data : DEFAULT_PREFIXES;
  const parsed = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^\+\d{1,7}$/.test(item));
  return parsed.length > 0 ? parsed : [DEFAULT_PREFIXES];
}

function phoneMatchesAllowlist(phone: string, prefixes: string[]): boolean {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  const matched = sorted.find((prefix) => phone.startsWith(prefix));
  if (!matched) return false;
  if (matched === "+33") return FRANCE_E164_RE.test(phone);
  return E164_RE.test(phone);
}
