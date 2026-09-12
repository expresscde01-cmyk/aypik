import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dropConfirmedInboxDecisionsSeenIn,
  hasConfirmedInboxDecisions,
  mergeConfirmedInboxDecisions,
  rememberConfirmedInboxDecision,
  resetConfirmedInboxDecisions,
} from './inboxDecisionOverlay.ts';

test('overlay Matcher : un SELECT en retard ne retire pas la décision match', () => {
  resetConfirmedInboxDecisions();
  rememberConfirmedInboxDecision('lucy', 'match', 'like');
  const stale = [
    {
      actor_id: 'lucy',
      decision: 'wait' as const,
      origin: 'like' as const,
      updated_at: '2026-09-01T00:00:00.000Z',
      wait_started_at: '2026-09-01T00:00:00.000Z',
    },
  ];
  const merged = mergeConfirmedInboxDecisions(stale);
  assert.equal(merged[0]?.decision, 'match');
  assert.notEqual(merged[0]?.updated_at, '2026-09-01T00:00:00.000Z');
  dropConfirmedInboxDecisionsSeenIn(stale);
  assert.equal(hasConfirmedInboxDecisions(), true);
  dropConfirmedInboxDecisionsSeenIn([
    { actor_id: 'lucy', decision: 'match' },
  ]);
  assert.equal(hasConfirmedInboxDecisions(), false);
});

test('overlay Matcher : snapshot sans ligne lucy — on injecte match quand même', () => {
  resetConfirmedInboxDecisions();
  rememberConfirmedInboxDecision('lucy', 'match', 'flash');
  const merged = mergeConfirmedInboxDecisions([]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.actor_id, 'lucy');
  assert.equal(merged[0]?.decision, 'match');
  dropConfirmedInboxDecisionsSeenIn([{ actor_id: 'other', decision: 'match' }]);
  assert.equal(hasConfirmedInboxDecisions(), true);
  resetConfirmedInboxDecisions();
});
