import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  decideCheckout,
  founderPriceCents,
  paymentGate,
  paymentsEnabledFromSetting,
  prorataDifferenceCents,
  serverChargeCents,
  webhookMayActivate,
} from '../../supabase/functions/_shared/billingPolicy.ts';
import { upgradeProrataCents } from '../../supabase/functions/_shared/checkoutFlow.ts';

test('arrondi au centime le plus proche, demi-centime vers le haut', () => {
  assert.equal(founderPriceCents(2499), 1250);
  assert.equal(founderPriceCents(1999), 1000);
  assert.equal(founderPriceCents(1499), 750);
  assert.equal(founderPriceCents(999), 500);
  assert.equal(founderPriceCents(599), 300);
  assert.equal(founderPriceCents(299), 150);
});

test('prorata Confort vers Premium, 10 jours sur 30, prix déjà réduits', () => {
  const cents = upgradeProrataCents({
    currentPublicCents: 1999,
    nextPublicCents: 2499,
    founder: true,
    daysLeft: 10,
    daysInPeriod: 30,
  });
  assert.equal(cents, 83);
  assert.equal(prorataDifferenceCents(1000, 1250, 10, 30), 83);
});

test('le serveur ignore le prix demandé par le client', () => {
  assert.equal(
    serverChargeCents({
      founder: false,
      publicCents: 2499,
      requestedCents: 1250,
      requestedPriceId: 'price_founder',
    }),
    2499
  );
  assert.equal(
    serverChargeCents({
      founder: true,
      publicCents: 2499,
      requestedCents: 2499,
      requestedPriceId: 'price_public',
    }),
    1250
  );
});

test('paiement réel refusé quand payments_enabled est à 0', () => {
  assert.equal(paymentsEnabledFromSetting(0), false);
  assert.deepEqual(
    paymentGate({
      paymentsEnabled: false,
      channel: 'stripe',
      stripeSecretKey: 'sk_live_real',
    }),
    { allowed: false, mode: 'blocked' }
  );
  assert.deepEqual(
    paymentGate({
      paymentsEnabled: false,
      channel: 'paypal',
      paypalApiBase: 'https://api-m.paypal.com',
    }),
    { allowed: false, mode: 'blocked' }
  );
  assert.deepEqual(
    paymentGate({
      paymentsEnabled: false,
      channel: 'stripe',
      stripeSecretKey: 'sk_test_demo',
    }),
    { allowed: true, mode: 'test' }
  );
  assert.deepEqual(
    paymentGate({
      paymentsEnabled: false,
      channel: 'paypal',
      paypalApiBase: 'https://api-m.sandbox.paypal.com',
    }),
    { allowed: true, mode: 'test' }
  );
});

test('un webhook sans signature vérifiée n’active rien', () => {
  assert.equal(webhookMayActivate(false), false);
  assert.equal(webhookMayActivate(true), true);
});

test('un seul prélèvement par droit, visibilité et géographie restent séparées', () => {
  assert.equal(
    decideCheckout({
      currentPlan: 'premium',
      targetPlan: 'premium',
      activePlans: ['premium'],
    }).kind,
    'duplicate'
  );
  const up = decideCheckout({
    currentPlan: 'basique',
    targetPlan: 'premium',
    activePlans: ['basique', 'francophone'],
  });
  assert.equal(up.kind, 'upgrade');
  assert.deepEqual(up.kind === 'upgrade' ? up.cancelNow : [], ['francophone']);
  assert.equal(
    decideCheckout({
      currentPlan: 'premium',
      targetPlan: 'confort',
      activePlans: ['premium'],
    }).kind,
    'downgrade'
  );
  const confort = decideCheckout({
    currentPlan: 'essentiel',
    targetPlan: 'confort',
    activePlans: ['essentiel', 'francophone'],
  });
  assert.deepEqual(confort.kind === 'upgrade' ? confort.cancelNow : [], [
    'francophone',
  ]);
  const premium = decideCheckout({
    currentPlan: 'confort',
    targetPlan: 'premium',
    activePlans: ['confort', 'international'],
  });
  assert.ok(premium.kind === 'upgrade' && premium.cancelNow.includes('international'));
  const geo = decideCheckout({
    currentPlan: 'essentiel',
    targetPlan: 'international',
    activePlans: ['essentiel', 'francophone'],
  });
  assert.deepEqual(geo.kind === 'upgrade' ? geo.cancelNow : [], ['francophone']);
  const both = decideCheckout({
    currentPlan: 'essentiel',
    targetPlan: 'visibilite',
    activePlans: ['essentiel', 'francophone'],
  });
  assert.deepEqual(both.kind === 'subscribe' ? both.cancelNow : null, []);
});

test('les fonctions de paiement refusent le réel et choisissent le prix', () => {
  const stripe = readFileSync(
    'supabase/functions/create-stripe-subscription/index.ts',
    'utf8'
  );
  const paypal = readFileSync(
    'supabase/functions/create-paypal-subscription/index.ts',
    'utf8'
  );
  const stripeHook = readFileSync(
    'supabase/functions/stripe-webhook/index.ts',
    'utf8'
  );
  const paypalHook = readFileSync(
    'supabase/functions/paypal-webhook/index.ts',
    'utf8'
  );
  for (const source of [stripe, paypal]) {
    assert.match(source, /gateForChannel/);
    assert.match(source, /payments_disabled/);
    assert.doesNotMatch(source, /body\.price|body\.priceId|body\.amount/);
    assert.match(source, /is_founder/);
  }
  assert.match(stripeHook, /constructEvent/);
  assert.match(paypalHook, /verify-webhook-signature/);
  assert.ok(
    paypalHook.indexOf('paypalSignatureValid(req, event)') <
      paypalHook.indexOf('await activatePaidOffer')
  );
});
