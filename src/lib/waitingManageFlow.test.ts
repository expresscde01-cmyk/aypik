import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitingManageServerMutation } from './waitingManageFlow.ts';

test('clic sens interdit ouvre la gestion sans mutation', () => {
  assert.equal(waitingManageServerMutation('open-manage'), 'none');
});

test('fermer la gestion (clic extérieur / Échap) ne mute pas inbox_responses', () => {
  assert.equal(waitingManageServerMutation('manage-dismiss'), 'none');
});

test('Archiver reste local ; Supprimer définitivement refuse', () => {
  assert.equal(waitingManageServerMutation('manage-archive'), 'archive-local');
  assert.equal(waitingManageServerMutation('manage-purge'), 'refuse');
});
