import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  recentInboxRefuseHidesSuggestion,
  refuseHiddenPeerId,
  SUGGEST_REFUSE_HIDE_MONTHS,
} from './suggestionRefuseHide.ts';

const now = new Date('2026-09-07T12:00:00.000Z');

test('refus de moins de 3 mois : masqué des suggestions (moi → l’autre et l’autre → moi)', () => {
  const recent = new Date(now);
  recent.setMonth(recent.getMonth() - 2);
  assert.equal(recentInboxRefuseHidesSuggestion(recent.toISOString(), now), true);
  assert.equal(SUGGEST_REFUSE_HIDE_MONTHS, 3);
  assert.equal(
    refuseHiddenPeerId(
      { user_id: 'me', actor_id: 'luck', decision: 'refuse' },
      'me'
    ),
    'luck'
  );
  assert.equal(
    refuseHiddenPeerId(
      { user_id: 'luck', actor_id: 'me', decision: 'refuse' },
      'me'
    ),
    'luck'
  );
});

test('refus de plus de 3 mois : le profil peut réapparaître', () => {
  const old = new Date(now);
  old.setMonth(old.getMonth() - 3);
  old.setDate(old.getDate() - 1);
  assert.equal(recentInboxRefuseHidesSuggestion(old.toISOString(), now), false);
});

test('wait / match : pas de masquage suggestions via ce filtre', () => {
  assert.equal(
    refuseHiddenPeerId(
      { user_id: 'me', actor_id: 'luck', decision: 'wait' },
      'me'
    ),
    null
  );
  assert.equal(
    refuseHiddenPeerId(
      { user_id: 'me', actor_id: 'luck', decision: 'match' },
      'me'
    ),
    null
  );
});
