import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chatNotMatchedMessage,
  matchManageDisplayError,
  matchManageRpcErrorCode,
} from './matchManageError.ts';

test('manage_active_match not_matched ne reste pas le code d’écriture', () => {
  assert.equal(matchManageRpcErrorCode('not_matched'), 'active_match_required');
  assert.equal(matchManageRpcErrorCode('not_authenticated'), 'not_authenticated');
});

test('la modale Gestion du match n’affiche pas le bandeau d’écriture', () => {
  assert.equal(matchManageDisplayError(chatNotMatchedMessage()), null);
  assert.equal(matchManageDisplayError('Impossible d’archiver ce match.'), 'Impossible d’archiver ce match.');
  assert.equal(matchManageDisplayError(null), null);
});
