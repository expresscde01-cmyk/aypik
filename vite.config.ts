import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** Empêche tout <script> sans src dans index.html (CSP script-src 'self'). */
function forbidInlineScripts(): Plugin {
  return {
    name: 'csp-forbid-inline-scripts',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi);
      if (inline?.length) {
        throw new Error(
          `CSP: ${inline.length} script(s) inline dans index.html. ` +
            `script-src 'self' les bloquerait en production.`
        );
      }
      return html;
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Chemins relatifs dans dist/ (./assets/...) : fonctionne à la racine
  // ou dans un sous-dossier o2switch, sans dépendre de l'URL absolue du domaine.
  base: './',
  plugins: [react(), forbidInlineScripts()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    // Pas de polyfill inline ni de <link modulepreload> (CSP script-src 'self').
    modulePreload: false,
    assetsInlineLimit: 0,
    // Découpage de code (chunks lazy via import()) : nécessite 'strict-dynamic'
    // dans la CSP de public/index.php pour que les chunks chargés dynamiquement
    // héritent de la confiance du script noncé. Sans ça, la CSP les bloque.
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
