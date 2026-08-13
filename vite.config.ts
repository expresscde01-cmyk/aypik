import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  // Chemins relatifs dans dist/ (./assets/...) : fonctionne à la racine
  // ou dans un sous-dossier o2switch, sans dépendre de l'URL absolue du domaine.
  base: './',
  plugins: [react()],
  build: {
    // Sans ça, Vite injecte un script inline (polyfill modulepreload)
    // bloqué par CSP script-src 'self' sur o2switch.
    modulePreload: { polyfill: false },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
