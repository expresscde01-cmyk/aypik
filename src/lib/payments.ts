import { loadStripe, type Stripe } from '@stripe/stripe-js/pure';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { supabase } from '@/lib/supabase';

const PAYMENTS_DISABLED =
  'Les paiements sont désactivés. Aypik est entièrement gratuit pour le moment.';

export type PaymentMethodChoice = 'card' | 'paypal';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Charge Stripe.js uniquement à la demande, et jamais en mode gratuit
 * (`@stripe/stripe-js` non-pure injecte js.stripe.com dès l’import du module).
 */
export function getStripe() {
  if (SITE_FREE_MODE || !stripePublishableKey) {
    return Promise.resolve(null);
  }
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublishableKey);
  }
  return stripePromise;
}

export function isStripeConfigured() {
  if (SITE_FREE_MODE) return false;
  return Boolean(stripePublishableKey);
}

export function isPayPalConfigured() {
  return Boolean(import.meta.env.VITE_PAYPAL_CLIENT_ID);
}

export async function createStripeSubscription(): Promise<{
  clientSecret: string;
  subscriptionId: string;
} | { error: string }> {
  if (SITE_FREE_MODE) return { error: PAYMENTS_DISABLED };
  const { data, error } = await supabase.functions.invoke(
    'create-stripe-subscription',
    { body: {} }
  );

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de démarrer le paiement Stripe. Vérifie que la fonction Edge est déployée.",
    };
  }

  if (data?.error) return { error: String(data.error) };
  if (!data?.clientSecret) {
    return { error: 'Réponse Stripe incomplète (clientSecret manquant).' };
  }

  return {
    clientSecret: data.clientSecret,
    subscriptionId: data.subscriptionId,
  };
}

export async function createPayPalSubscription(urls: {
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ approveUrl: string; subscriptionId: string } | { error: string }> {
  if (SITE_FREE_MODE) return { error: PAYMENTS_DISABLED };
  const { data, error } = await supabase.functions.invoke(
    'create-paypal-subscription',
    { body: urls }
  );

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de démarrer PayPal. Vérifie que la fonction Edge est déployée.",
    };
  }

  if (data?.error) return { error: String(data.error) };
  if (!data?.approveUrl) {
    return { error: 'URL d’approbation PayPal manquante.' };
  }

  return {
    approveUrl: data.approveUrl,
    subscriptionId: data.subscriptionId,
  };
}

export async function cancelPremiumSubscription(): Promise<string | null> {
  if (SITE_FREE_MODE) return PAYMENTS_DISABLED;
  const { data, error } = await supabase.functions.invoke('cancel-premium', {
    body: {},
  });

  if (error) {
    return (
      error.message ||
      'Impossible de résilier. Réessaie ou contacte le support.'
    );
  }

  if (data?.error) return String(data.error);
  return null;
}
