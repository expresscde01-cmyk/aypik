import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATCH_CARD_DEPART_CLASS,
  MATCH_CARD_DEPART_MS,
  matchCardDepartClass,
  matchCardDepartDurationMs,
} from './matchCardDepart.ts';

test('sortie de fiche : une classe partagée, pas une anim par bouton', () => {
  assert.equal(MATCH_CARD_DEPART_CLASS, 'match-card-departing');
  assert.equal(
    matchCardDepartClass('rounded-2xl match-card-new', true),
    `rounded-2xl match-card-new ${MATCH_CARD_DEPART_CLASS}`
  );
  assert.equal(matchCardDepartClass('rounded-2xl match-card-new', false), 'rounded-2xl match-card-new');
  assert.equal(
    matchCardDepartClass('rounded-2xl p-4 animate-fadeIn cursor-pointer', true),
    `rounded-2xl p-4 cursor-pointer ${MATCH_CARD_DEPART_CLASS}`
  );
});

test('durée de départ : 420 ms, 0 si reduced-motion', () => {
  assert.equal(MATCH_CARD_DEPART_MS, 420);
  assert.equal(matchCardDepartDurationMs(false), 420);
  assert.equal(matchCardDepartDurationMs(true), 0);
});
