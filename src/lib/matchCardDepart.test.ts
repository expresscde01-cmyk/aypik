import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATCH_CARD_DEPART_CLASS,
  MATCH_CARD_DEPART_MS,
  matchCardDepartClass,
  matchCardDepartDurationMs,
  retainDepartingMatches,
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

test('reload pendant l’anim : la fiche partante garde son étage d’origine', () => {
  const prev = [
    { profile: { id: 'lucy' }, kind: 'like' },
    { profile: { id: 'other' }, kind: 'like' },
  ];
  const next = [
    { profile: { id: 'lucy' }, kind: 'match' },
    { profile: { id: 'other' }, kind: 'like' },
  ];
  const kept = retainDepartingMatches(prev, next, new Set(['lucy']));
  assert.equal(kept.find((m) => m.profile.id === 'lucy')?.kind, 'like');
  assert.equal(kept.find((m) => m.profile.id === 'other')?.kind, 'like');
});
