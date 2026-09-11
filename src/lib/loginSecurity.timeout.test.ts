import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOGIN_CLIENT_TIMEOUT_MS,
  loginTimeoutMessage,
  LoginClientTimeoutError,
  isLoginClientTimeout,
  withClientTimeout,
} from './loginClientTimeout.ts';
import { shouldCountLoginFailure } from './authErrors.ts';

test('timeout client : la promesse se termine avec le message visible', async () => {
  const hang = new Promise<never>(() => {});
  await assert.rejects(
    () => withClientTimeout(hang, 20),
    (err: unknown) => {
      assert.equal(isLoginClientTimeout(err), true);
      assert.equal((err as Error).message, loginTimeoutMessage());
      return true;
    }
  );
});

test('timeout client : une réponse à temps n’est pas interrompue', async () => {
  const value = await withClientTimeout(Promise.resolve(42), 200);
  assert.equal(value, 42);
});

test('timeout client : une erreur réelle n’est pas masquée par le délai', async () => {
  await assert.rejects(
    () => withClientTimeout(Promise.reject(new Error('reseau')), 200),
    (err: unknown) => {
      assert.equal(isLoginClientTimeout(err), false);
      assert.equal((err as Error).message, 'reseau');
      return true;
    }
  );
});

test('timeout client : ne compte pas comme un échec de mot de passe', () => {
  assert.equal(shouldCountLoginFailure(new LoginClientTimeoutError()), false);
  assert.equal(LOGIN_CLIENT_TIMEOUT_MS, 12_000);
});
