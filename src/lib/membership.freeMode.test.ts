import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FOUNDER_MAX_SLOTS, SITE_FREE_MODE } from './founderCopy.ts';
import {
  DEFAULT_MEMBERSHIP,
  isFrancophoneLocked,
  isInternationalLocked,
  isMessagingLocked,
  isVisibilityLocked,
  type MembershipStatus,
} from './membership.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function postTrialLockedOut(): MembershipStatus {
  return {
    ...DEFAULT_MEMBERSHIP,
    plan: 'free',
    phase: 'post_trial',
    has_messaging_access: false,
    has_visibility_access: false,
    has_francophone_access: false,
    has_international_access: false,
  };
}

test('[règle produit] offre Fondateur : 1000 membres, site gratuit', () => {
  assert.equal(FOUNDER_MAX_SLOTS, 1000);
  assert.equal(SITE_FREE_MODE, true);
  const status = postTrialLockedOut();
  assert.equal(isMessagingLocked(status), false);
  assert.equal(isVisibilityLocked(status), false);
  assert.equal(isFrancophoneLocked(status), false);
  assert.equal(isInternationalLocked(status), false);
});

test('FR/EN/ES : les libellés « Choisis une offre » existent mais restent derrière le verrou', () => {
  for (const file of ['fr.json', 'en.json', 'es.json']) {
    const json = JSON.parse(
      readFileSync(join(root, 'src/locales', file), 'utf8')
    ) as {
      membership: { lockedNeedOffer: string; chatLockedHint: string };
    };
    assert.equal(typeof json.membership.lockedNeedOffer, 'string');
    assert.equal(json.membership.lockedNeedOffer.length > 0, true);
    assert.equal(typeof json.membership.chatLockedHint, 'string');
    assert.equal(json.membership.chatLockedHint.length > 0, true);
  }
});
