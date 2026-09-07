import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BELL_GHOST_CLICK_MS,
  ghostClickIgnoreUntil,
  shouldIgnoreBellClick,
} from './bellGhostClick.ts';

test('tap overlay hors cloche : pas de click fantôme à avaler', () => {
  assert.equal(ghostClickIgnoreUntil(1000, false), null);
});

test('tap overlay sur la cloche : le click suivant (mobile) est ignoré', () => {
  const until = ghostClickIgnoreUntil(1000, true);
  assert.equal(until, 1000 + BELL_GHOST_CLICK_MS);
  assert.equal(shouldIgnoreBellClick(until!, 1000), true);
  assert.equal(shouldIgnoreBellClick(until!, 1000 + 300), true);
  assert.equal(shouldIgnoreBellClick(until!, until!), false);
});
