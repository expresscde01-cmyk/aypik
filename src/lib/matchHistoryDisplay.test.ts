import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isLiveWaitByOther,
  matchSheetUsesCrown,
  matchSheetViaWait,
  originHistoryIso,
  dropPinnedId,
  pinIdsFirst,
  matchIdsIncludingInboxDecisions,
  removeActorFromCategoryDigest,
  splitPendingByOthers,
} from './matchHistoryDisplay.ts';

const likeSent = '2026-08-20T10:00:00.000Z';
const waitStarted = '2026-08-25T12:00:00.000Z';
const matchedAt = '2026-09-06T15:00:00.000Z';

test('Mis en attente par l’autre : un match conclu ne fuit pas dans la liste wait', () => {
  const { liveWaits, matchedViaWaitPeerIds } = splitPendingByOthers([
    {
      peer_id: 'still-waiting',
      decision: 'wait',
      wait_started_at: waitStarted,
    },
    {
      peer_id: 'suzanne',
      decision: 'match',
      wait_started_at: waitStarted,
    },
  ]);
  assert.deepEqual(
    liveWaits.map((row) => row.peer_id),
    ['still-waiting']
  );
  assert.equal(matchedViaWaitPeerIds.has('suzanne'), true);
  assert.equal(matchedViaWaitPeerIds.has('still-waiting'), false);
});

test('ancienne RPC sans decision : toutes les lignes restent des wait en cours', () => {
  const { liveWaits, matchedViaWaitPeerIds } = splitPendingByOthers([
    { peer_id: 'a', decision: null, wait_started_at: null },
  ]);
  assert.equal(liveWaits.length, 1);
  assert.equal(matchedViaWaitPeerIds.size, 0);
  assert.equal(isLiveWaitByOther({ decision: null }), true);
});

test('OK7→Suzanne (initiated) : date d’origine = Like envoyé, pas le jour du Match', () => {
  const iso = originHistoryIso({
    matchRole: 'initiated',
    dateReceived: matchedAt,
    matchedAt,
    matchedBackAt: likeSent,
  });
  assert.equal(iso, likeSent);
  assert.notEqual(iso, matchedAt);
  assert.equal(matchSheetUsesCrown(true, true), true);
});

test('Suzanne→OK7 (accepted) : wait_started_at sur sa propre ligne déclenche la couronne', () => {
  assert.equal(matchSheetViaWait(waitStarted, null), true);
  const iso = originHistoryIso({
    matchRole: 'accepted',
    dateReceived: likeSent,
    matchedAt: likeSent,
    matchedBackAt: matchedAt,
  });
  assert.equal(iso, likeSent);
  assert.equal(matchSheetUsesCrown(true, true), true);
});

test('parcours direct : pas de couronne, date d’origine corrigée', () => {
  assert.equal(matchSheetViaWait(null, null), false);
  assert.equal(matchSheetUsesCrown(true, false), false);
  const initiated = originHistoryIso({
    matchRole: 'initiated',
    dateReceived: matchedAt,
    matchedAt,
    matchedBackAt: likeSent,
  });
  assert.equal(initiated, likeSent);
  const accepted = originHistoryIso({
    matchRole: 'accepted',
    dateReceived: likeSent,
    matchedAt: likeSent,
    matchedBackAt: matchedAt,
  });
  assert.equal(accepted, likeSent);
});

test('pinIdsFirst : les ids du digest passent en tête dans cet ordre', () => {
  const items = [{ id: 'c' }, { id: 'a' }, { id: 'd' }, { id: 'b' }];
  const pinned = pinIdsFirst(items, ['a', 'b'], (row) => row.id);
  assert.deepEqual(
    pinned.map((row) => row.id),
    ['a', 'b', 'c', 'd']
  );
});

test('dropPinnedId : une fiche traitée sort du lot, les autres restent', () => {
  assert.deepEqual(dropPinnedId(['a', 'b', 'c'], 'b'), ['a', 'c']);
  assert.deepEqual(dropPinnedId(['a'], 'a'), []);
  const same = ['a', 'b'];
  assert.equal(dropPinnedId(same, 'z'), same);
});

test('ouvrir une fiche du digest 1er mot : elle sort des pins, les autres clignotent encore', () => {
  const afterOpen = dropPinnedId(['test2', 'lucy', 'sabine'], 'test2');
  assert.deepEqual(afterOpen, ['lucy', 'sabine']);
  assert.equal(dropPinnedId(['test2'], 'test2').length, 0);
});

test('Matcher (couronne) : décision inbox match sort la fiche vers 1er mot, même sans like renvoyé en cache', () => {
  const ids = matchIdsIncludingInboxDecisions([], [
    { actor_id: 'luck', decision: 'match' },
    { actor_id: 'still-new', decision: 'wait' },
  ]);
  assert.equal(ids.has('luck'), true);
  assert.equal(ids.has('still-new'), false);
});

test('Matcher : un match déjà vu via likes croisés reste un match', () => {
  const ids = matchIdsIncludingInboxDecisions(['mutual'], [
    { actor_id: 'luck', decision: 'match' },
  ]);
  assert.equal(ids.has('mutual'), true);
  assert.equal(ids.has('luck'), true);
});

test('removeActorFromCategoryDigest : 3 → 2 → 1 → plus de digest', () => {
  const three = {
    count: 3,
    visible: true,
    ids: ['a', 'b', 'c'],
    soleId: null as string | null,
    soleName: null as string | null,
  };
  const two = removeActorFromCategoryDigest(three, 'b');
  assert.deepEqual(two?.ids, ['a', 'c']);
  assert.equal(two?.count, 2);
  const one = removeActorFromCategoryDigest(two, 'c');
  assert.deepEqual(one?.ids, ['a']);
  assert.equal(one?.count, 1);
  assert.equal(removeActorFromCategoryDigest(one, 'a'), null);
});
