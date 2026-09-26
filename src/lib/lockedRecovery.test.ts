import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockedAccountMayIssueToken } from './lockedAccessToken.ts';
import {
  appScreenForSession,
  recoveryLinkFailure,
} from './passwordRecoveryRoute.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  join(
    root,
    'supabase/migrations/20260926221000_recovery_session_while_locked.sql',
  ),
  'utf8',
);

const sentAt = '2026-09-26T20:00:00.000Z';
const now = Date.parse('2026-09-26T20:10:00.000Z');

test('lien de récupération valide sur un compte bloqué : formulaire puis déblocage', () => {
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'recovery',
      recoverySentAt: sentAt,
      recoveryTokenEmpty: true,
      now,
    }),
    true,
  );
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'otp',
      recoverySentAt: sentAt,
      recoveryTokenEmpty: true,
      now,
    }),
    true,
  );
  assert.equal(recoveryLinkFailure(null), null);
  assert.equal(
    appScreenForSession({
      loading: false,
      passwordRecovery: true,
      hasSession: true,
    }),
    'recovery',
  );

  const screen = readFileSync(
    join(root, 'src/components/ResetPasswordScreen.tsx'),
    'utf8',
  );
  const updateAt = screen.indexOf('auth.updateUser');
  const unlockAt = screen.indexOf('await unlockLoginSecurity');
  assert.ok(updateAt > 0 && unlockAt > updateAt);
  assert.doesNotMatch(screen, /refreshSession/);
  assert.match(screen, /auth\.unlockFailed/);
  assert.match(screen, /stopAutoRefresh/);

  const auth = readFileSync(join(root, 'src/lib/auth.tsx'), 'utf8');
  assert.equal(auth.match(/return supabase\.auth\.verifyOtp/g)?.length, 1);
  assert.doesNotMatch(auth, /slice\('pkce_'\)/);

  assert.match(migration, /method = 'recovery'/);
  assert.match(migration, /method = 'otp'/);
  assert.match(migration, /recovery_sent_at/);
  assert.match(migration, /recovery_token/);
  assert.match(migration, /interval '1 hour'/);
});

test('connexion par mot de passe sur un compte bloqué : toujours refusée', () => {
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'password',
      recoverySentAt: sentAt,
      recoveryTokenEmpty: true,
      now,
    }),
    false,
  );
  assert.doesNotMatch(migration, /method = 'password'/);
  assert.match(migration, /account_locked/);
});

test('rafraîchissement sur un compte bloqué : toujours refusé', () => {
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'token_refresh',
      recoverySentAt: sentAt,
      recoveryTokenEmpty: true,
      now,
    }),
    false,
  );
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'magiclink',
      recoverySentAt: sentAt,
      recoveryTokenEmpty: true,
      now,
    }),
    false,
  );
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'otp',
      recoverySentAt: sentAt,
      recoveryTokenEmpty: false,
      now,
    }),
    false,
  );
  assert.equal(
    lockedAccountMayIssueToken({
      authenticationMethod: 'otp',
      recoverySentAt: '2026-09-26T18:00:00.000Z',
      recoveryTokenEmpty: true,
      now,
    }),
    false,
  );
  assert.doesNotMatch(migration, /method = 'token_refresh'/);
  assert.equal(recoveryLinkFailure({ message: 'account_locked' }), 'locked');
  assert.equal(
    recoveryLinkFailure({ message: 'One-time token not found' }),
    'invalid',
  );
});
