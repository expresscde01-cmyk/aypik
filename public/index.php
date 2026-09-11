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

$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$requestPath = is_string($requestPath) && $requestPath !== '' ? $requestPath : '/';
$locale = 'fr';
$restPath = $requestPath;
if (preg_match('#^/(fr|en|es)(/.*)?$#', $requestPath, $localeMatch)) {
    $locale = $localeMatch[1];
    $restPath = $localeMatch[2] ?? '/';
    if ($restPath === '') {
        $restPath = '/';
    }
}
if ($locale === 'fr' && preg_match('#^/fr(/.*)?$#', $requestPath)) {
    $qs = (string) ($_SERVER['QUERY_STRING'] ?? '');
    $target = ($restPath === '/' ? '/' : $restPath) . ($qs !== '' ? '?' . $qs : '');
    header('Location: ' . $target, true, 301);
    exit;
}

// Miroir de src/i18n/locales.ts LOCALE_PLACEHOLDER — désactiver langue par langue après trad pro.
$localePlaceholder = [
    'fr' => false,
    'en' => false,
    'es' => false,
];
$localeIsPlaceholder = !empty($localePlaceholder[$locale]);

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = (string) ($_SERVER['HTTP_HOST'] ?? 'aypik.fr');
$origin = $scheme . '://' . $host;
$hreflangRest = $restPath === '/' ? '/' : rtrim($restPath, '/');
$hreflangFr = $origin . ($hreflangRest === '/' ? '/' : $hreflangRest);
$hreflangEn = $origin . '/en' . ($hreflangRest === '/' ? '/' : $hreflangRest);
$hreflangEs = $origin . '/es' . ($hreflangRest === '/' ? '/' : $hreflangRest);

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

$bootJs = <<<'JS'
(function () {
  var root = document.getElementById('root');
  if (!root) return;
  var fallback = null;
  function onBooted() {
    if (!root.childNodes.length) return;
    clearTimeout(timer);
    obs.disconnect();
    if (fallback) {
      fallback.remove();
      fallback = null;
    }
  }
  var obs = new MutationObserver(onBooted);
  obs.observe(root, { childList: true });
  var timer = setTimeout(function () {
    if (root.childNodes.length) {
      onBooted();
      return;
    }
    fallback = document.createElement('div');
    fallback.id = 'aypik-boot-fallback';
    fallback.setAttribute('role', 'alert');
    fallback.style.cssText =
      'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:linear-gradient(to bottom right,#fff1f2,#ffffff,#fffbeb);font-family:system-ui,sans-serif;text-align:center;';
    var box = document.createElement('div');
    box.style.maxWidth = '24rem';
    var title = document.createElement('p');
    title.style.cssText =
      'margin:0 0 0.5rem;font-size:1.125rem;font-weight:700;color:#111827;';
    title.textContent = "La page n’a pas pu s’afficher.";
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Réessayer';
    btn.style.cssText =
      'padding:0.625rem 1.5rem;border:0;border-radius:0.75rem;background:#f43f5e;color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', function () {
      function go() {
        location.replace(location.href);
      }
      if (!('serviceWorker' in navigator)) {
        go();
        return;
      }
      navigator.serviceWorker
        .getRegistrations()
        .then(function (regs) {
          return Promise.all(
            regs.map(function (r) {
              return r.unregister();
            })
          );
        })
        .then(go, go);
    });
    box.appendChild(title);
    box.appendChild(btn);
    fallback.appendChild(box);
    document.body.appendChild(fallback);
  }, 4000);
})();
JS;
$bootFallback =
    '<script nonce="' . $nonceAttr . '">' . $bootJs . '</script>';
$html = preg_replace('/<\/body>/i', $bootFallback . '</body>', $html, 1) ?? $html;

$html = preg_replace(
    '/<html\s+lang="fr">/i',
    '<html lang="' . htmlspecialchars($locale, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">',
    $html,
    1
) ?? $html;

$ogLocale = $locale === 'en' ? 'en_GB' : ($locale === 'es' ? 'es_ES' : 'fr_FR');
$html = preg_replace(
    '/property="og:locale"\s+content="fr_FR"/i',
    'property="og:locale" content="' . $ogLocale . '"',
    $html,
    1
) ?? $html;

$hFr = htmlspecialchars($hreflangFr, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$hEn = htmlspecialchars($hreflangEn, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$hEs = htmlspecialchars($hreflangEs, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$hreflangParts = ['<link rel="alternate" hreflang="fr" href="' . $hFr . '" data-aypik-hreflang="1">'];
if (!$localePlaceholder['en']) {
    $hreflangParts[] = '<link rel="alternate" hreflang="en" href="' . $hEn . '" data-aypik-hreflang="1">';
}
if (!$localePlaceholder['es']) {
    $hreflangParts[] = '<link rel="alternate" hreflang="es" href="' . $hEs . '" data-aypik-hreflang="1">';
}
$hreflangParts[] = '<link rel="alternate" hreflang="x-default" href="' . $hFr . '" data-aypik-hreflang="1">';
$hreflangTags = implode('', $hreflangParts);
if ($localeIsPlaceholder) {
    $hreflangTags =
        '<meta name="robots" content="noindex, follow" data-aypik-robots="1">' . $hreflangTags;
} else {
    $hreflangTags =
        '<meta name="robots" content="index, follow" data-aypik-robots="1">' . $hreflangTags;
}
$html = preg_replace('/<\/head>/i', $hreflangTags . '</head>', $html, 1) ?? $html;

if ($localeIsPlaceholder && ($locale === 'en' || $locale === 'es')) {
    $prefix = $locale === 'en' ? '[EN] ' : '[ES] ';
    $html = preg_replace(
        '/<title>AYPIK<\/title>/',
        '<title>' . $prefix . 'AYPIK</title>',
        $html,
        1
    ) ?? $html;
    $html = preg_replace(
        '/(content=")(Aypik — )/u',
        '$1' . $prefix . '$2',
        $html
    ) ?? $html;
}

echo $html;
