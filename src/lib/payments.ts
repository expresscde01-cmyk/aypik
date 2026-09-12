import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { supabase } from '@/lib/supabase';
import { t } from '../i18n/t.ts';

function paymentsDisabledMessage(): string {
  return t('membership.paymentsDisabled');
}

export type PaymentMethodChoice = 'card' | 'paypal';
export type PaymentPlanTier = 'confort' | 'premium';

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

export async function createStripeSubscription(
  plan: PaymentPlanTier = 'confort'
): Promise<{
  clientSecret: string;
  subscriptionId: string;
} | { error: string }> {
  if (SITE_FREE_MODE) return { error: paymentsDisabledMessage() };
  const { data, error } = await supabase.functions.invoke(
    'create-stripe-subscription',
    { body: { plan } }
  );

  if (error) {
    return {
      error:
        error.message ||
        t('membership.stripeStartFail'),
    };
  }

  if (data?.error) return { error: String(data.error) };
  if (!data?.clientSecret) {
    return { error: t('membership.stripeIncomplete') };
  }

  return {
    clientSecret: data.clientSecret,
    subscriptionId: data.subscriptionId,
  };
}

export async function createPayPalSubscription(
  urls: {
    returnUrl: string;
    cancelUrl: string;
  },
  plan: PaymentPlanTier = 'confort'
): Promise<{ approveUrl: string; subscriptionId: string } | { error: string }> {
  if (SITE_FREE_MODE) return { error: paymentsDisabledMessage() };
  const { data, error } = await supabase.functions.invoke(
    'create-paypal-subscription',
    { body: { ...urls, plan } }
  );

  if (error) {
    return {
      error:
        error.message ||
        t('membership.paypalStartFail'),
    };
  }

  if (data?.error) return { error: String(data.error) };
  if (!data?.approveUrl) {
    return { error: t('membership.paypalApproveMissing') };
  }

  return {
    approveUrl: data.approveUrl,
    subscriptionId: data.subscriptionId,
  };
}

export async function cancelPremiumSubscription(): Promise<string | null> {
  if (SITE_FREE_MODE) return paymentsDisabledMessage();
  const { data, error } = await supabase.functions.invoke('cancel-premium', {
    body: {},
  });

  if (error) {
    return (
      error.message ||
      t('membership.cancelFail')
    );
  }

  if (data?.error) return String(data.error);
  return null;
}
