import { defineConfig, loadEnv, type Plugin } from 'vite';
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

function requirePublicSupabaseEnv(mode: string): Plugin {
  return {
    name: 'require-public-supabase-env',
    apply: 'build',
    config() {
      if (mode !== 'production') return;
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const url = (env.VITE_SUPABASE_URL || '').trim();
      const key = (env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (!url.includes('supabase.co') || !key.startsWith('eyJ')) {
        throw new Error(
          'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absentes. Vérifie .env.production.',
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Chemins relatifs dans dist/ (./assets/...) : fonctionne à la racine
  // ou dans un sous-dossier o2switch, sans dépendre de l'URL absolue du domaine.
  base: './',
  plugins: [react(), forbidInlineScripts(), requirePublicSupabaseEnv(mode)],
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
