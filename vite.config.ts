import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** Refuse un zip o2switch sans URL / clé anon (sinon « supabaseUrl is required »). */
function requirePublicSupabaseEnv(): Plugin {
  return {
    name: 'require-public-supabase-env',
    apply: 'build',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const url = env.VITE_SUPABASE_URL ?? '';
      const key = env.VITE_SUPABASE_ANON_KEY ?? '';
      if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(url) || !key.startsWith('eyJ')) {
        throw new Error(
          'Build bloqué : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquent (.env.production).'
        );
      }
    },
  };
}

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
  plugins: [react(), requirePublicSupabaseEnv(), forbidInlineScripts()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    // Pas de polyfill inline ni de <link modulepreload> (CSP script-src 'self').
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Un seul JS : pas de chunks lazy bloqués par Apache / CSP.
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
