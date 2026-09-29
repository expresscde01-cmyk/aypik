import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { supabase } from '@/lib/supabase';
import { t } from '../i18n/t.ts';

function paymentsDisabledMessage(): string {
  return t('membership.paymentsDisabled');
}

export type PaymentMethodChoice = 'card' | 'paypal';
export type PaymentPlanTier =
  | 'basique'
  | 'essentiel'
  | 'confort'
  | 'premium'
  | 'visibilite'
  | 'francophone'
  | 'international';
/** Cible d'une résiliation : le palier, ou l'une des 3 options à la carte. */
export type CancelTarget = 'plan' | 'visibilite' | 'francophone' | 'international';

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
  if (SITE_FREE_MODE) return false;
  return Boolean(import.meta.env.VITE_PAYPAL_CLIENT_ID);
}

export type CheckoutStart =
  | {
      clientSecret: string;
      subscriptionId: string;
      prorataCents?: number;
    }
  | { approveUrl: string; subscriptionId: string; subscriptionApproveUrl?: string | null }
  | { scheduled: true; effectiveAt: string | null }
  | { error: string };

export async function createStripeSubscription(
  plan: PaymentPlanTier = 'confort'
): Promise<CheckoutStart> {
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
  if (data?.scheduled) {
    return { scheduled: true, effectiveAt: data.effectiveAt ?? null };
  }
  if (!data?.clientSecret) {
    if (data?.subscriptionId) {
      return {
        clientSecret: '',
        subscriptionId: data.subscriptionId,
        prorataCents: data.prorataCents ?? 0,
      };
    }
    return { error: t('membership.stripeIncomplete') };
  }

  return {
    clientSecret: data.clientSecret,
    subscriptionId: data.subscriptionId,
    prorataCents: data.prorataCents,
  };
}

export async function createPayPalSubscription(
  urls: {
    returnUrl: string;
    cancelUrl: string;
  },
  plan: PaymentPlanTier = 'confort'
): Promise<CheckoutStart> {
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
  if (data?.scheduled) {
    return { scheduled: true, effectiveAt: data.effectiveAt ?? null };
  }
  if (!data?.approveUrl) {
    return { error: t('membership.paypalApproveMissing') };
  }

  return {
    approveUrl: data.approveUrl,
    subscriptionId: data.subscriptionId,
    subscriptionApproveUrl: data.subscriptionApproveUrl ?? null,
  };
}

export async function cancelPremiumSubscription(
  target: CancelTarget = 'plan'
): Promise<string | null> {
  if (SITE_FREE_MODE) return paymentsDisabledMessage();
  const { data, error } = await supabase.functions.invoke('cancel-premium', {
    body: { target },
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
