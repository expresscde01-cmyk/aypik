import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isPaidPremiumSubscription,
  nextBoostSource,
  refreshPremiumBoostCredit,
  usablePremiumBoosts,
  type PremiumBoostAccount,
} from './premiumBoostCredits.ts';

const now = Date.parse('2026-09-29T12:00:00Z');
const later = '2026-10-29T12:00:00.000Z';
const started = '2026-09-01T12:00:00.000Z';

function paid(overrides: Partial<PremiumBoostAccount> = {}): PremiumBoostAccount {
  return {
    plan: 'premium',
    paidPremiumStartedAt: started,
    premiumUntil: later,
    remaining: 0,
    periodEnd: null,
    ...overrides,
  };
}

test('Fondateur sans Premium payé : 0 Boost Premium', () => {
  const founderTrial: PremiumBoostAccount = {
    plan: 'founder',
    paidPremiumStartedAt: null,
    premiumUntil: later,
    remaining: 2,
    periodEnd: later,
  };
  const freePeriod: PremiumBoostAccount = {
    plan: 'free',
    paidPremiumStartedAt: null,
    premiumUntil: null,
    remaining: 0,
    periodEnd: null,
  };
  assert.equal(isPaidPremiumSubscription(founderTrial, now), false);
  assert.equal(isPaidPremiumSubscription(freePeriod, now), false);
  assert.equal(refreshPremiumBoostCredit(founderTrial, now).granted, false);
  assert.equal(refreshPremiumBoostCredit(freePeriod, now).granted, false);
  assert.equal(usablePremiumBoosts(founderTrial, now), 0);
  assert.equal(usablePremiumBoosts(freePeriod, now), 0);
});

test('Premium payé : 2 au premier passage, pas deux fois la même période', () => {
  const first = refreshPremiumBoostCredit(paid(), now);
  assert.equal(first.granted, true);
  assert.equal(first.account.remaining, 2);
  assert.equal(first.account.periodEnd, later);
  const second = refreshPremiumBoostCredit(first.account, now);
  assert.equal(second.granted, false);
  assert.equal(second.account.remaining, 2);
});

test('deux activations simultanées : une seule écriture pose les 2', () => {
  const snapshot = paid();
  const first = refreshPremiumBoostCredit(snapshot, now);
  const late = refreshPremiumBoostCredit(first.account, now);
  assert.equal(first.granted, true);
  assert.equal(late.granted, false);
  assert.equal(late.account.remaining, 2);
});

test('redescente puis remontée dans la même période : pas de second crédit', () => {
  const credited = refreshPremiumBoostCredit(paid(), now).account;
  const used = { ...credited, remaining: 1, plan: 'confort' as const };
  assert.equal(usablePremiumBoosts(used, now), 1);
  const back = refreshPremiumBoostCredit(
    { ...used, plan: 'premium' },
    now
  );
  assert.equal(back.granted, false);
  assert.equal(back.account.remaining, 1);
});

test('renouvellement : premium_until avance, on repose 2', () => {
  const credited = refreshPremiumBoostCredit(paid(), now).account;
  const renewed = refreshPremiumBoostCredit(
    {
      ...credited,
      remaining: 1,
      premiumUntil: '2026-11-29T12:00:00.000Z',
    },
    now
  );
  assert.equal(renewed.granted, true);
  assert.equal(renewed.account.remaining, 2);
});

test('ordre : Fondateur, puis mois Premium, puis achat ; Gratuit refusé', () => {
  assert.equal(
    nextBoostSource({ founderRemaining: 1, premiumRemaining: 2, plan: 'free' }),
    'founder'
  );
  assert.equal(
    nextBoostSource({ founderRemaining: 0, premiumRemaining: 2, plan: 'premium' }),
    'premium'
  );
  assert.equal(
    nextBoostSource({ founderRemaining: 0, premiumRemaining: 0, plan: 'essentiel' }),
    'paid'
  );
  assert.equal(
    nextBoostSource({ founderRemaining: 0, premiumRemaining: 0, plan: 'free' }),
    'refused'
  );
  assert.equal(
    nextBoostSource({ founderRemaining: 0, premiumRemaining: 0, plan: 'basique' }),
    'refused'
  );
  assert.equal(
    nextBoostSource({ founderRemaining: 0, premiumRemaining: 0, plan: 'founder' }),
    'refused'
  );
});

test('SQL : crédit lié au Premium payé, une seule écriture par période', () => {
  const sql = readFileSync(
    new URL(
      '../../supabase/migrations/20260929220000_premium_monthly_boosts.sql',
      import.meta.url
    ),
    'utf8'
  );
  const sync = sql.slice(
    sql.indexOf('FUNCTION public.sync_premium_boost_credit'),
    sql.indexOf('FUNCTION public.my_premium_boost_credits')
  );
  assert.match(sync, /FOR UPDATE/);
  assert.match(sync, /paid_premium_started_at IS NOT NULL/);
  assert.match(sync, /m\.plan = 'premium'/);
  assert.match(sync, /premium_boosts_period_end IS DISTINCT FROM m\.premium_until/);
  assert.match(sync, /IF FOUND THEN/);
  assert.doesNotMatch(sync, /founder_premium_until/);
  assert.doesNotMatch(sync, /is_founder/);
});
