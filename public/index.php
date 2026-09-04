<?php
/**
 * Point d'entrée SPA (o2switch / Apache + PHP).
 *
 * Génère un nonce CSP par requête, l'expose au HTML (meta + attributs nonce
 * sur les <script>), et pose l'en-tête Content-Security-Policy.
 *
 * Nécessaire pour Turnstile : api.js est déjà chargé en <script src="…">
 * externe, mais Cloudflare injecte ensuite des scripts inline dont le
 * contenu change à chaque fois (les empreintes sha256 ne tiennent pas).
 * Avec un nonce sur api.js, Turnstile le propage à ces scripts dynamiques
 * (doc Cloudflare CSP / Turnstile).
 */

declare(strict_types=1);

$htmlPath = __DIR__ . '/index.html';
if (!is_readable($htmlPath)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'index.html introuvable.';
    exit;
}

$nonce = bin2hex(random_bytes(16));

// CSP mode gratuit (SITE_FREE_MODE) : pas de Stripe/PayPal.
// script-src : 'self' (bundle Vite) + nonce (inline Turnstile propagé) + host CF
// + 'strict-dynamic' (propage la confiance du script noncé aux chunks Vite
// chargés dynamiquement — sans lui, le découpage de code JS est bloqué par la CSP).
// Navigateurs sans 'strict-dynamic' : retombent sur 'self' + nonce + host CF ci-dessus.
// Quand les paiements seront réactivés, réintroduire js.stripe.com / *.stripe.com /
// *.stripe.network / PayPal dans script-src, connect-src, frame-src, form-action, img-src.
$csp = implode(
    '; ',
    [
        "default-src 'self'",
        "script-src 'self' 'nonce-{$nonce}' 'strict-dynamic' https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.supabase.co",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://geo.api.gouv.fr https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
);

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Content-Security-Policy: ' . $csp);

$html = file_get_contents($htmlPath);
if ($html === false) {
    http_response_code(500);
    echo 'Impossible de lire index.html.';
    exit;
}

$nonceAttr = htmlspecialchars($nonce, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

// Racine de l’app (pas l’URL /contact) : les assets relatifs ./assets/…
// doivent rester à la racine du site, y compris en sous-dossier.
$html = preg_replace('/<base\b[^>]*>/i', '', $html) ?? $html;
$scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
$scriptDir = dirname($scriptName);
$basePath = ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.')
    ? '/'
    : rtrim($scriptDir, '/') . '/';
$baseTag = '<base href="' . htmlspecialchars($basePath, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">';
$html = preg_replace('/<head([^>]*)>/i', '<head$1>' . $baseTag, $html, 1) ?? $html;

// Meta lisible par le front (Turnstile.tsx pose le même nonce sur api.js).
$meta = '<meta name="csp-nonce" content="' . $nonceAttr . '">';
if (stripos($html, 'name="csp-nonce"') === false) {
    $html = preg_replace('/<head([^>]*)>/i', '<head$1>' . $meta, $html, 1) ?? $html;
}

// Nonce sur chaque <script> sans nonce déjà présent (bundle module Vite inclus).
$html = preg_replace(
    '/<script(?![^>]*\bnonce=)(\s)/i',
    '<script nonce="' . $nonceAttr . '"$1',
    $html
) ?? $html;
$html = preg_replace(
    '/<script(?![^>]*\bnonce=)>/i',
    '<script nonce="' . $nonceAttr . '">',
    $html
) ?? $html;

echo $html;
