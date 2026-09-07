import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revealThenVerifyLock } from './loginSessionGate.ts';

test('revealThenVerifyLock : l’UI s’affiche avant la fin du check verrou', async () => {
  const order: string[] = [];
  let unlock!: (locked: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    unlock = resolve;
  });

  revealThenVerifyLock({
    reveal: () => order.push('reveal'),
    isLocked: () => {
      order.push('check-started');
      return pending;
    },
    onLocked: () => {
      order.push('kicked');
    },
  });

  assert.deepEqual(order, ['reveal', 'check-started']);
  unlock(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ['reveal', 'check-started', 'kicked']);
});

test('revealThenVerifyLock : pas verrouillé → pas de signOut', async () => {
  let kicked = false;
  revealThenVerifyLock({
    reveal: () => {},
    isLocked: async () => false,
    onLocked: () => {
      kicked = true;
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(kicked, false);
});
