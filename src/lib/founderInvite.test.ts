import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOUNDER_INVITE_DISMISS_KEY,
  dismissFounderInvite,
  founderInviteVariant,
  isDisplayedFounderNumber,
  isFounderInviteDismissed,
  parseFounderSlotSnapshot,
} from './founderInvite.ts';

const store = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  },
});

test('compteur : uniquement un entier renvoyé, jamais une valeur inventée', () => {
  assert.deepEqual(parseFounderSlotSnapshot(null), { known: false });
  assert.deepEqual(parseFounderSlotSnapshot({}), { known: false });
  assert.deepEqual(
    parseFounderSlotSnapshot({ founders_remaining: '930' }),
    { known: false }
  );
  assert.deepEqual(
    parseFounderSlotSnapshot({ founders_remaining: 10.5 }),
    { known: false }
  );
  assert.deepEqual(
    parseFounderSlotSnapshot({ founders_remaining: -1 }),
    { known: false }
  );
  assert.deepEqual(
    parseFounderSlotSnapshot({
      founders_remaining: 50,
      founder_offer_closed: true,
    }),
    { known: true, remaining: 0 }
  );
  assert.deepEqual(
    parseFounderSlotSnapshot({
      founders_remaining: 930,
      founder_offer_closed: false,
    }),
    { known: true, remaining: 930 }
  );
});

test('texte : plus de 200 places, puis 200 ou moins, puis plus rien', () => {
  assert.equal(founderInviteVariant(930), 'open');
  assert.equal(founderInviteVariant(201), 'open');
  assert.equal(founderInviteVariant(200), 'scarce');
  assert.equal(founderInviteVariant(1), 'scarce');
  assert.equal(founderInviteVariant(0), 'hidden');
  assert.equal(isDisplayedFounderNumber(12), true);
  assert.equal(isDisplayedFounderNumber(0), false);
  assert.equal(isDisplayedFounderNumber(null), false);
});

test('fermeture du bandeau Fondateur : mémorisée à part du bandeau visiteur', () => {
  store.clear();
  assert.equal(isFounderInviteDismissed(), false);
  dismissFounderInvite();
  assert.equal(store.get(FOUNDER_INVITE_DISMISS_KEY), '1');
  assert.equal(isFounderInviteDismissed(), true);
});
