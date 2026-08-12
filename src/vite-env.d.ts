/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_PAYPAL_CLIENT_ID: string;
  /** noop (défaut) | edge — voir docs/EMAIL.md */
  readonly VITE_EMAIL_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
