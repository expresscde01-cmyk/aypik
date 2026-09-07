import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowSignInTokens,
  lockedFlagFromStatus,
} from './signInLockGate.ts';

test('(a) compte verrouillé + session GoTrue → pas de tokens', () => {
  assert.equal(
    allowSignInTokens({
      hasAccessToken: true,
      hasRefreshToken: true,
      locked: true,
    }),
    false
  );
});

test('(b) compte non verrouillé + session GoTrue → tokens autorisés', () => {
  assert.equal(lockedFlagFromStatus({ ok: true, locked: false }), false);
  assert.equal(
    allowSignInTokens({
      hasAccessToken: true,
      hasRefreshToken: true,
      locked: false,
    }),
    true
  );
});

test('(c) même règle hors client : verrouillé → refus, pas de tokens', () => {
  assert.equal(
    lockedFlagFromStatus({ ok: true, locked: true }),
    true
  );
  assert.equal(
    allowSignInTokens({
      hasAccessToken: true,
      hasRefreshToken: true,
      locked: lockedFlagFromStatus({ ok: true, locked: true }),
    }),
    false
  );
});

test('statut illisible : pas de tokens (échec fermé)', () => {
  assert.equal(
    allowSignInTokens({
      hasAccessToken: true,
      hasRefreshToken: true,
      locked: null,
    }),
    false
  );
});
