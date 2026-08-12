import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';

export type PaymentMethodChoice = 'card' | 'paypal';
export type CheckoutProduct = 'premium' | 'boost';

export const BOOST_PRICE_CENTS = 299;

/**
 * Interrupteur unique pour Stripe / PayPal (Premium + Boost).
 * - `false` : lancement Fondateur gratuit — les CTAs de paiement sont masqués,
 *   le code Stripe/PayPal reste intact et prêt à servir.
 * - `true`  : réactive immédiatement les boutons et le modal de checkout.
 *
 * Ne pas supprimer le code de paiement : basculez uniquement ce drapeau.
 */
export const ENABLE_PAYMENTS = false;

/** @deprecated Préférer `!ENABLE_PAYMENTS`. Conservé pour compatibilité. */
export const PAYMENTS_TEMPORARILY_DISABLED = !ENABLE_PAYMENTS;

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe() {
  if (!stripePublishableKey) return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublishableKey);
  }
  return stripePromise;
}

export function isStripeConfigured() {
  return Boolean(stripePublishableKey);
}

export function isPayPalConfigured() {
  return Boolean(import.meta.env.VITE_PAYPAL_CLIENT_ID);
}

export async function createStripeSubscription(): Promise<{
  clientSecret: string;
  subscriptionId: string;
} | { error: string }> {
  const { data, error } = await supabase.functions.invoke(
    'create-stripe-subscription',
    { body: {} }
  );

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de démarrer le paiement Stripe. Vérifiez que la fonction Edge est déployée.",
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

export async function createStripeBoostPayment(): Promise<{
  clientSecret: string;
  paymentIntentId: string;
} | { error: string }> {
  const { data, error } = await supabase.functions.invoke(
    'create-stripe-boost-payment',
    { body: {} }
  );

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de démarrer le paiement Boost. Déployez create-stripe-boost-payment.",
    };
  }

  if (data?.error) return { error: String(data.error) };
  if (!data?.clientSecret) {
    return { error: 'Réponse Stripe Boost incomplète (clientSecret manquant).' };
  }

  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId,
  };
}

export async function createPayPalSubscription(urls: {
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ approveUrl: string; subscriptionId: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke(
    'create-paypal-subscription',
    { body: urls }
  );

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de démarrer PayPal. Vérifiez que la fonction Edge est déployée.",
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

export async function createPayPalBoostOrder(urls: {
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ approveUrl: string; orderId: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke(
    'create-paypal-boost-order',
    { body: urls }
  );

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de démarrer PayPal Boost. Déployez create-paypal-boost-order.",
    };
  }

  if (data?.error) return { error: String(data.error) };
  if (!data?.approveUrl || !data?.orderId) {
    return { error: 'Réponse PayPal Boost incomplète.' };
  }

  return {
    approveUrl: data.approveUrl,
    orderId: data.orderId,
  };
}

export async function capturePayPalBoostOrder(
  orderId: string
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke(
    'capture-paypal-boost-order',
    { body: { orderId } }
  );
  if (error) return error.message || 'Capture PayPal Boost impossible.';
  if (data?.error) return String(data.error);
  return null;
}

/** Active le boost côté base après confirmation client (Stripe Elements). */
export async function activatePaidBoost(
  provider: 'stripe' | 'paypal' = 'stripe'
): Promise<string | null> {
  const { error } = await supabase.rpc('activate_paid_boost', {
    p_provider: provider,
  });
  if (error) {
    if (
      error.code === '42883' ||
      /activate_paid_boost/i.test(error.message)
    ) {
      const { error: fallback } = await supabase.rpc('purchase_boost');
      return fallback?.message ?? null;
    }
    return error.message;
  }
  return null;
}

export async function cancelPremiumSubscription(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('cancel-premium', {
    body: {},
  });

  if (error) {
    return (
      error.message ||
      'Impossible de résilier. Réessayez ou contactez le support.'
    );
  }

  if (data?.error) return String(data.error);
  return null;
}

export const PAYMENT_RETURN_FLAG = 'aypik_payment_return';

export function markPaymentReturn(product: CheckoutProduct) {
  try {
    sessionStorage.setItem(
      PAYMENT_RETURN_FLAG,
      JSON.stringify({ product, at: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function consumePaymentReturn(): CheckoutProduct | null {
  try {
    const raw = sessionStorage.getItem(PAYMENT_RETURN_FLAG);
    sessionStorage.removeItem(PAYMENT_RETURN_FLAG);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { product?: string };
    if (parsed.product === 'premium' || parsed.product === 'boost') {
      return parsed.product;
    }
  } catch {
    // ignore
  }
  return null;
}
