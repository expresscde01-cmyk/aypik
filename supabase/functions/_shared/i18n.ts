import fr from "./locales/fr.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type EmailLocale = "fr" | "en" | "es";

const CATALOGS: Record<EmailLocale, Record<string, string>> = {
  fr: fr as Record<string, string>,
  en: en as Record<string, string>,
  es: es as Record<string, string>,
};

function publicSiteUrl(): string {
  const raw =
    Deno.env.get("PUBLIC_SITE_URL")?.trim() ||
    Deno.env.get("SITE_URL")?.trim() ||
    "https://aypik.fr";
  return raw.replace(/\/$/, "");
}

export function interpolate(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(vars[key] ?? ""),
  );
}

export function emailT(
  locale: EmailLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const catalog = CATALOGS[locale] ?? CATALOGS.fr;
  const value = catalog[key] ?? CATALOGS.fr[key] ?? key;
  return vars ? interpolate(value, vars) : value;
}

export function isEmailLocale(value: unknown): value is EmailLocale {
  return value === "fr" || value === "en" || value === "es";
}

export async function profileEmailLocale(
  admin: SupabaseClient,
  userId: string,
): Promise<EmailLocale> {
  const { data, error } = await admin
    .from("profiles")
    .select("preferred_locale")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("preferred_locale lookup failed", error.message);
    return "fr";
  }
  return isEmailLocale(data?.preferred_locale) ? data.preferred_locale : "fr";
}

export function localizedSiteUrl(
  locale: EmailLocale,
  rest = "/",
  siteUrl = publicSiteUrl(),
): string {
  const origin = siteUrl.replace(/\/$/, "");
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  if (locale === "fr") return `${origin}${path === "/" ? "" : path}`;
  return `${origin}/${locale}${path === "/" ? "/" : path}`;
}

export function localizedPreferencesUrl(
  locale: EmailLocale,
  siteUrl = publicSiteUrl(),
): string {
  const base = localizedSiteUrl(locale, "/", siteUrl).replace(/\/$/, "");
  return `${base}/?open=preferences`;
}
