import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasTwoWayDialogue,
  peersWithTwoWayDialogueFromRows,
} from './twoWayDialogue.ts';

const me = 'test2';
const valentine = 'valentine';

test('aucun message : reste 1er mot', () => {
  assert.equal(hasTwoWayDialogue([], me, valentine), false);
});

test('plusieurs messages d’un seul côté (moi) : reste 1er mot', () => {
  assert.equal(
    hasTwoWayDialogue(
      [{ sender_id: me }, { sender_id: me }, { sender_id: me }],
      me,
      valentine
    ),
    false
  );
});

test('plusieurs messages d’un seul côté (l’autre) : reste 1er mot', () => {
  assert.equal(
    hasTwoWayDialogue(
      [
        { sender_id: valentine },
        { sender_id: valentine },
        { sender_id: valentine },
      ],
      me,
      valentine
    ),
    false
  );
});

test('un message de chaque côté : Discussion en cours', () => {
  assert.equal(
    hasTwoWayDialogue(
      [{ sender_id: me }, { sender_id: valentine }],
      me,
      valentine
    ),
    true
  );
});

test('recalcul type chargement : plusieurs messages d’un seul côté n’ajoutent pas le pair', () => {
  const twoWay = peersWithTwoWayDialogueFromRows(
    [
      { sender_id: me, recipient_id: valentine },
      { sender_id: me, recipient_id: valentine },
      { sender_id: me, recipient_id: valentine },
    ],
    me
  );
  assert.equal(twoWay.has(valentine), false);
});

test('recalcul type chargement : un de chaque côté ajoute le pair', () => {
  const twoWay = peersWithTwoWayDialogueFromRows(
    [
      { sender_id: me, recipient_id: valentine },
      { sender_id: valentine, recipient_id: me },
    ],
    me
  );
  assert.equal(twoWay.has(valentine), true);
});
