import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appScreenForSession,
  getRecoveryTokenFromUrl,
} from './passwordRecoveryRoute.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const RECOVERY_URL =
  'https://aypik.fr/?reset=1&type=recovery&token_hash=pkce_exemple';

function openRecoveryUrl(): void {
  const url = new URL(RECOVERY_URL);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: url.href,
        search: url.search,
        hash: url.hash,
        pathname: url.pathname,
        origin: url.origin,
        hostname: url.hostname,
      },
    },
  });
}

test('lien mot de passe oublié : la page nouveau mot de passe s’affiche', () => {
  openRecoveryUrl();
  const token = getRecoveryTokenFromUrl();
  assert.equal(token?.type, 'recovery');
  assert.equal(token?.tokenHash.startsWith('pkce_'), true);

  const passwordRecovery = Boolean(token);
  assert.equal(
    appScreenForSession({
      loading: false,
      passwordRecovery,
      hasSession: false,
    }),
    'recovery',
  );
  assert.equal(
    appScreenForSession({
      loading: false,
      passwordRecovery: true,
      hasSession: true,
    }),
    'recovery',
  );
  assert.equal(
    appScreenForSession({
      loading: false,
      passwordRecovery: false,
      hasSession: false,
    }),
    'landing',
  );

  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /appScreenForSession/);
  assert.doesNotMatch(app, /hasSession && opts\.passwordRecovery/);

  const auth = readFileSync(join(root, 'src/lib/auth.tsx'), 'utf8');
  assert.match(auth, /verifyOtp/);
  assert.doesNotMatch(auth, /slice\('pkce_'\)/);
  assert.match(auth, /recoveryLinkFailure/);
  assert.match(auth, /stopAutoRefresh/);

  const fr = JSON.parse(
    readFileSync(join(root, 'src/locales/fr.json'), 'utf8'),
  ) as { auth: { resetTitle: string; resetLinkInvalid: string } };
  assert.equal(fr.auth.resetTitle, 'Nouveau mot de passe');
  assert.match(fr.auth.resetLinkInvalid, /expir/i);
  assert.match(fr.auth.resetLinkInvalid, /déjà été utilisé/);
});
