import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SIGN_SECONDS = 60 * 60;
const MAX_PATHS = 100;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.trim()) return json({ error: "Non authentifié" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Signature indisponible" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(jwt);
  if (userError || !user) return json({ error: "Session invalide" }, 401);

  let paths: unknown;
  try {
    const body = await req.json();
    paths = body?.paths;
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) {
    return json({ error: "photo_sign_chunk_too_large" }, 400);
  }
  const requested = paths.filter((item): item is string => typeof item === "string");

  const { data: allowed, error: filterError } = await admin.rpc(
    "prepare_profile_photo_signs",
    { p_user_id: user.id, p_paths: requested },
  );
  if (filterError) {
    const message = filterError.message || "";
    if (message.includes("photo_sign_chunk_too_large")) {
      return json({ error: "photo_sign_chunk_too_large" }, 400);
    }
    if (message.includes("not_authenticated")) {
      return json({ error: "Non authentifié" }, 401);
    }
    return json({ error: "Signature indisponible" }, 503);
  }
  if (allowed == null) {
    return json({ urls: {}, limited: true }, 200);
  }

  const signable = (allowed as string[]).filter((path) => typeof path === "string");
  if (signable.length === 0) return json({ urls: {}, limited: false }, 200);

  const urls: Record<string, string> = {};
  await Promise.all(
    signable.map(async (path) => {
      const { data, error } = await admin.storage
        .from("profile-photos")
        .createSignedUrl(path, SIGN_SECONDS, {
          transform: { width: 400, resize: "cover", quality: 70 },
        });
      const url = data?.signedUrl || "";
      if (!error && url.includes("/storage/v1/render/image/sign/")) {
        urls[path] = url;
      }
    }),
  );

  return json({ urls, limited: false }, 200);
});
