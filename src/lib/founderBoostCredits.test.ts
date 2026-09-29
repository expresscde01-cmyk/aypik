import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateBoost,
  addCalendarMonths,
  creditFounderBoosts,
  creditFounderJoiningAfterLaunch,
  forgetFounderBoostsOnDeletion,
  FOUNDER_BOOST_COUNT,
  grantsMonthBoostOnSignup,
  nextBoostEndsAt,
  usableFounderBoosts,
} from './founderBoostCredits.ts';

const launch = new Date('2026-09-29T12:00:00.000Z');

test('2 Boosts Fondateur crédités au passage au payant, même échéance', () => {
  const wallets = creditFounderBoosts(['ada', 'beau'], launch);
  assert.equal(wallets.length, 2);
  assert.equal(wallets[0].remaining, FOUNDER_BOOST_COUNT);
  assert.equal(wallets[0].expiresAtMs, wallets[1].expiresAtMs);
  assert.equal(usableFounderBoosts(wallets[0], launch.getTime()), 2);
});

test('les Boosts Fondateur expirent au bout de 6 mois', () => {
  const [wallet] = creditFounderBoosts(['ada'], launch);
  const justBefore = wallet.expiresAtMs - 1;
  const atExpiry = wallet.expiresAtMs;
  assert.equal(usableFounderBoosts(wallet, justBefore), 2);
  assert.equal(usableFounderBoosts(wallet, atExpiry), 0);
  const spent = activateBoost({
    wallet,
    nowMs: atExpiry,
    activeEndsAtMs: null,
  });
  assert.equal(spent.source, 'paid');
  assert.equal(spent.wallet?.remaining, 2);
});

test('un Boost Fondateur est utilisé avant un Boost payant', () => {
  const [wallet] = creditFounderBoosts(['ada'], launch);
  const now = launch.getTime() + 1000;
  const first = activateBoost({
    wallet,
    nowMs: now,
    activeEndsAtMs: null,
  });
  assert.equal(first.source, 'founder');
  assert.equal(first.wallet?.remaining, 1);
  const second = activateBoost({
    wallet: first.wallet,
    nowMs: now,
    activeEndsAtMs: first.endsAtMs,
  });
  assert.equal(second.source, 'founder');
  assert.equal(second.wallet?.remaining, 0);
  const third = activateBoost({
    wallet: second.wallet,
    nowMs: now,
    activeEndsAtMs: second.endsAtMs,
  });
  assert.equal(third.source, 'paid');
  assert.equal(third.wallet?.remaining, 0);
});

test('prolongation de 24 h si un Boost est déjà en cours', () => {
  const now = Date.parse('2026-09-29T15:00:00.000Z');
  const activeUntil = now + 3 * 60 * 60 * 1000;
  assert.equal(nextBoostEndsAt(null, now) - now, 24 * 60 * 60 * 1000);
  assert.equal(nextBoostEndsAt(activeUntil, now) - activeUntil, 24 * 60 * 60 * 1000);
  const [wallet] = creditFounderBoosts(['ada'], launch);
  const extended = activateBoost({
    wallet,
    nowMs: now,
    activeEndsAtMs: activeUntil,
  });
  assert.equal(extended.endsAtMs, activeUntil + 24 * 60 * 60 * 1000);
});

test('les Boosts Fondateur sont perdus à la suppression du compte', () => {
  const wallets = creditFounderBoosts(['ada', 'beau'], launch);
  const left = forgetFounderBoostsOnDeletion(wallets, 'ada');
  assert.deepEqual(left.map((wallet) => wallet.userId), ['beau']);
});

test('un Fondateur inscrit après le crédit a sa propre échéance, une seule fois', () => {
  const signedUp = new Date('2027-03-01T08:00:00.000Z');
  const [shared] = creditFounderBoosts(['ada'], launch);
  const wallet = creditFounderJoiningAfterLaunch({
    userId: 'cleo',
    launchAlreadyCredited: true,
    alreadyCredited: false,
    signedUpAt: signedUp,
  });
  assert.ok(wallet);
  assert.equal(wallet.userId, 'cleo');
  assert.equal(wallet.remaining, FOUNDER_BOOST_COUNT);
  assert.notEqual(wallet.expiresAtMs, shared.expiresAtMs);
  assert.equal(
    wallet.expiresAtMs,
    addCalendarMonths(signedUp, 6).getTime()
  );
  assert.equal(
    creditFounderJoiningAfterLaunch({
      userId: 'cleo',
      launchAlreadyCredited: true,
      alreadyCredited: true,
      signedUpAt: signedUp,
    }),
    null
  );
  assert.equal(
    creditFounderJoiningAfterLaunch({
      userId: 'cleo',
      launchAlreadyCredited: false,
      alreadyCredited: false,
      signedUpAt: signedUp,
    }),
    null
  );
});

test('plus aucun Boost d’un mois à l’inscription', () => {
  assert.equal(grantsMonthBoostOnSignup(), false);
});
