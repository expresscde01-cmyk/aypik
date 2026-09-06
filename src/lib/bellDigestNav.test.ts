import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  firstExchangeNotificationCopy,
  firstDigestTone,
  formatDigestNameList,
  newProfilesNotificationCopy,
  resolveDigestPeople,
  sliceDigestPeople,
  waitingProfilesNotificationCopy,
} from './digestCopy.ts';
import { removeActorFromCategoryDigest } from './matchHistoryDisplay.ts';
import {
  absorbRubricConsultation,
  bellHeaderBadgeCount,
  bellRubricFreshIds,
  bellRubricPoints,
  BELL_RUBRIC_UNREAD_KINDS,
  collectUnreadActorIds,
  digestPinIdsFromEntries,
  digestRecapSort,
  observeRubricMembers,
  filterServerDigestIds,
  likeFloorForActor,
  mergeInboxPublish,
  selectLiveDigestIds,
  normalizeOpenMatchesOpts,
  openDigestOpts,
  openLikeOpts,
  socialLikeInDiscoverSet,
} from './matchesNav.ts';

const entries = [
  { id: 'a', status: 'new' },
  { id: 'b', status: 'new' },
  { id: 'c', status: 'wait' },
  { id: 'd', status: 'wait' },
  { id: 'e', status: 'matched' },
  { id: 'f', status: 'matched-chat' },
];

test('compteur À découvrir = newIds, pas max(likes non lus, inbox)', () => {
  const newIds = digestPinIdsFromEntries(entries, 'new');
  assert.deepEqual(newIds, ['a', 'b']);
  assert.equal(newIds.length, 2);
  assert.notEqual(newIds.length, 4);
});

test('digest En attente exclut les archives locales', () => {
  const waitIds = digestPinIdsFromEntries(entries, 'wait', ['d']);
  assert.deepEqual(waitIds, ['c']);
});

test('digest 1er mot = matchs silencieux', () => {
  const firstIds = digestPinIdsFromEntries(entries, 'first');
  assert.deepEqual(firstIds, ['e']);
});

test('clic digest new/wait/first : pulse + pinIds = texte', () => {
  const newIds = digestPinIdsFromEntries(entries, 'new');
  const waitIds = digestPinIdsFromEntries(entries, 'wait', ['d']);
  const firstIds = digestPinIdsFromEntries(entries, 'first');
  const fresh = normalizeOpenMatchesOpts(openDigestOpts('new', newIds));
  assert.equal(fresh.pulseCategory, 'new');
  assert.deepEqual(fresh.pinActorIds, newIds);
  const wait = normalizeOpenMatchesOpts(openDigestOpts('wait', waitIds));
  assert.equal(wait.pulseCategory, 'wait');
  assert.deepEqual(wait.pinActorIds, waitIds);
  const first = normalizeOpenMatchesOpts(openDigestOpts('first', firstIds));
  assert.equal(first.pulseCategory, 'first');
  assert.deepEqual(first.pinActorIds, firstIds);
});

test('clic Like : actor pin 1 + étage new, ou wait si déjà en attente', () => {
  const likeNew = normalizeOpenMatchesOpts(openLikeOpts('a', 'new'));
  assert.equal(likeNew.pulseCategory, 'new');
  assert.deepEqual(likeNew.pinActorIds, ['a']);
  assert.equal(likeFloorForActor('c', ['c', 'd']), 'wait');
  const likeWait = normalizeOpenMatchesOpts(
    openLikeOpts('c', likeFloorForActor('c', ['c']))
  );
  assert.equal(likeWait.pulseCategory, 'wait');
  assert.deepEqual(likeWait.pinActorIds, ['c']);
});

test('pins filtrés vides : les opts de navigation restent posés', () => {
  const requested = ['gone'];
  const live = digestPinIdsFromEntries(entries, 'wait').filter((id) =>
    requested.includes(id)
  );
  assert.deepEqual(live, []);
  const opts = normalizeOpenMatchesOpts(openDigestOpts('wait', requested));
  assert.equal(opts.pulseCategory, 'wait');
  assert.deepEqual(opts.pinActorIds, requested);
});

test('récap wait / 1er mot en bas du bloc', () => {
  assert.equal(digestRecapSort(true, false), 1);
  assert.equal(digestRecapSort(false, true), -1);
  assert.equal(digestRecapSort(true, true), 0);
});

test('Like individuels ⊂ newIds quand le digest a des ids', () => {
  assert.equal(socialLikeInDiscoverSet('a', ['a', 'b']), true);
  assert.equal(socialLikeInDiscoverSet('c', ['a', 'b'], ['c']), false);
  assert.equal(socialLikeInDiscoverSet('z', ['a', 'b']), false);
  assert.equal(socialLikeInDiscoverSet('x', [], ['c']), true);
  assert.equal(socialLikeInDiscoverSet('c', [], ['c']), false);
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
  assert.equal(two?.count, 2);
  const one = removeActorFromCategoryDigest(two, 'c');
  assert.equal(one?.count, 1);
  assert.equal(removeActorFromCategoryDigest(one, 'a'), null);
});

test('cloche : stock d’une rubrique = 1, chaque nouveauté = 1, messages = 1', () => {
  const discover = bellRubricPoints({
    memberIds: ['old1', 'old2', 'old3', 'like1', 'like2'],
    freshIds: ['like1', 'like2'],
  });
  assert.equal(discover, 3);
  const wait = bellRubricPoints({
    memberIds: ['wait-old1', 'wait-old2', 'wait-new'],
    freshIds: ['wait-new'],
  });
  assert.equal(wait, 2);
  const first = bellRubricPoints({
    memberIds: [],
    freshIds: [],
  });
  assert.equal(first, 0);
  const total = bellHeaderBadgeCount({
    rubrics: [
      {
        memberIds: ['old1', 'old2', 'old3', 'like1', 'like2'],
        freshIds: ['like1', 'like2'],
      },
      {
        memberIds: ['wait-old1', 'wait-old2', 'wait-new'],
        freshIds: ['wait-new'],
      },
      { memberIds: [], freshIds: [] },
    ],
    unreadMessageCount: 5,
  });
  assert.equal(total, 6);
});

test('cloche : 20 anciens À découvrir sans nouveauté = 1, pas 20', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
  assert.equal(bellRubricPoints({ memberIds: ids, freshIds: [] }), 1);
});

test('cloche : 7 messages non lus = 1 point, pas 7', () => {
  assert.equal(
    bellHeaderBadgeCount({
      rubrics: [],
      unreadMessageCount: 7,
    }),
    1
  );
  assert.equal(
    bellHeaderBadgeCount({
      rubrics: [],
      unreadMessageCount: 0,
    }),
    0
  );
});

test('Tout lu / plus de stock ni nouveauté : badge = messages seulement', () => {
  assert.equal(
    bellHeaderBadgeCount({
      rubrics: [
        { memberIds: [], freshIds: [] },
        { memberIds: [], freshIds: [] },
        { memberIds: [], freshIds: [] },
      ],
      unreadMessageCount: 1,
    }),
    1
  );
});

test('nouveautés d’une rubrique : likes non lus ∪ entrée de session, hors exclus', () => {
  const items = [
    { kind: 'like_received', actor_id: 'a', read_at: null },
    { kind: 'like_received', actor_id: 'b', read_at: null },
    { kind: 'like_received', actor_id: 'old', read_at: '2026-01-01' },
    { kind: 'flash_received', actor_id: 'a', read_at: null },
  ];
  const fresh = bellRubricFreshIds({
    unreadItems: items,
    unreadKinds: BELL_RUBRIC_UNREAD_KINDS.new,
    sessionEnteredIds: ['reset'],
    excludeIds: ['b'],
  });
  assert.deepEqual(fresh.sort(), ['a', 'reset'].sort());
  assert.deepEqual(
    collectUnreadActorIds(items, BELL_RUBRIC_UNREAD_KINDS.new).sort(),
    ['a', 'b'].sort()
  );
});

test('matcher une attente : un publish serveur périmé ne remet pas le digest à 2', () => {
  const staleServer = [
    { id: 'c', status: 'wait' },
    { id: 'd', status: 'wait' },
  ];
  const merged = mergeInboxPublish(staleServer, {
    matched: new Set(['c']),
    refused: new Set(),
    wait: new Set(['c', 'd']),
  });
  const waitIds = digestPinIdsFromEntries(merged, 'wait');
  assert.deepEqual(waitIds, ['d']);
});

test('mettre en attente : le digest À découvrir perd la fiche même si le serveur dit encore new', () => {
  const staleServer = [
    { id: 'a', status: 'new' },
    { id: 'b', status: 'new' },
  ];
  const merged = mergeInboxPublish(staleServer, {
    matched: new Set(),
    refused: new Set(),
    wait: new Set(['a']),
  });
  const newIds = digestPinIdsFromEntries(merged, 'new');
  assert.deepEqual(newIds, ['b']);
});

test('countInboxCategories en retard : filterServerDigestIds aligne le texte sur le sticky', () => {
  const sticky = {
    matched: new Set(['c']),
    refused: new Set(),
    wait: new Set(['c', 'd']),
  };
  assert.deepEqual(filterServerDigestIds(['c', 'd'], sticky, 'wait'), ['d']);
  assert.deepEqual(filterServerDigestIds(['a', 'b'], sticky, 'new'), ['a', 'b']);
  assert.deepEqual(
    filterServerDigestIds(['a', 'b'], { ...sticky, wait: new Set(['a']) }, 'new'),
    ['b']
  );
});

test('texte digest = intersection snapshot ∩ serveur (pas le snapshot du 1er chargement)', () => {
  const emptySticky = {
    matched: new Set<string>(),
    refused: new Set<string>(),
    wait: new Set<string>(),
  };
  const waitIds = selectLiveDigestIds({
    snapshotIds: ['c', 'd'],
    serverIds: ['d'],
    sticky: emptySticky,
    as: 'wait',
    snapshotReady: true,
    serverReady: true,
  });
  assert.deepEqual(waitIds, ['d']);
  const newIds = selectLiveDigestIds({
    snapshotIds: ['a', 'b'],
    serverIds: ['b'],
    sticky: emptySticky,
    as: 'new',
    snapshotReady: true,
    serverReady: true,
  });
  assert.deepEqual(newIds, ['b']);
});

test('digest : les noms suivent la liste live (pas un compteur figé)', () => {
  const namesById = { c: 'Paul Martin', d: 'Luck' };
  const before = resolveDigestPeople(['c', 'd'], namesById);
  assert.match(
    waitingProfilesNotificationCopy(before.map((p) => p.name)).body,
    /Paul et Luck/
  );
  const afterIds = selectLiveDigestIds({
    snapshotIds: ['c', 'd'],
    serverIds: ['d'],
    sticky: {
      matched: new Set<string>(),
      refused: new Set<string>(),
      wait: new Set<string>(),
    },
    as: 'wait',
    snapshotReady: true,
    serverReady: true,
  });
  const after = resolveDigestPeople(afterIds, namesById);
  assert.deepEqual(
    after.map((p) => p.name),
    ['Luck']
  );
  const copy = waitingProfilesNotificationCopy(after.map((p) => p.name));
  assert.match(copy.body, /Luck/);
  assert.doesNotMatch(copy.body, /Paul/);
});

test('liste de noms : jusqu’à 4 in extenso, au-delà « A, B et N autres »', () => {
  assert.equal(formatDigestNameList(['Paul']), 'Paul');
  assert.equal(formatDigestNameList(['Paul', 'OK5']), 'Paul et OK5');
  assert.equal(
    formatDigestNameList(['Paul', 'OK5', 'Luck']),
    'Paul, OK5 et Luck'
  );
  assert.equal(
    formatDigestNameList(['Sabine', 'Lucy', 'Alexandra', 'Sandrine']),
    'Sabine, Lucy, Alexandra et Sandrine'
  );
  assert.equal(
    formatDigestNameList(['Paul', 'OK5', 'Luck', 'A', 'B', 'C', 'D']),
    'Paul, OK5 et 5 autres'
  );
  const slice = sliceDigestPeople(
    resolveDigestPeople(['1', '2', '3', '4'], {
      '1': 'Paul',
      '2': 'OK5',
      '3': 'Luck',
      '4': 'A',
    })
  );
  assert.equal(slice.shown.length, 4);
  assert.equal(slice.extra, 0);
  assert.match(
    firstExchangeNotificationCopy(['Paul', 'OK5', 'Luck']).body,
    /Paul, OK5 et Luck/
  );
  assert.match(
    newProfilesNotificationCopy(['Paul', 'OK5']).body,
    /profils de Paul et OK5/
  );
});

test('clic d’un nom : pin 1 fiche + étage du digest', () => {
  const opts = normalizeOpenMatchesOpts(openDigestOpts('first', ['e']));
  assert.equal(opts.pulseCategory, 'first');
  assert.deepEqual(opts.pinActorIds, ['e']);
});

test('1er mot : match one-way (message reçu) reste dans le digest, comme Mes Matchs', () => {
  const snap = [
    { id: 'sabine', status: 'matched' },
    { id: 'lucy', status: 'matched' },
    { id: 'alexandra', status: 'matched' },
    { id: 'sandrine', status: 'matched' },
    { id: 'chatty', status: 'matched-chat' },
  ];
  const firstIds = digestPinIdsFromEntries(snap, 'first');
  assert.deepEqual(firstIds, ['sabine', 'lucy', 'alexandra', 'sandrine']);
  assert.equal(firstDigestTone(firstIds, ['alexandra', 'sandrine']), 'mixed');
  assert.match(
    firstExchangeNotificationCopy(
      ['Sabine', 'Lucy', 'Alexandra', 'Sandrine'],
      'mixed'
    ).body,
    /écrire ou à répondre à Sabine, Lucy, Alexandra et Sandrine/
  );
});

test('Pas cette fois : stock = 1, pas 1 par refus ; un nouveau refus = +1', () => {
  const baseline = { primed: false, seen: new Set<string>() };
  const first = observeRubricMembers(baseline, ['lucy-d', 'edith'], true);
  assert.deepEqual(first.freshIds, []);
  assert.equal(
    bellRubricPoints({
      memberIds: ['lucy-d', 'edith'],
      freshIds: first.freshIds,
    }),
    1
  );
  const second = observeRubricMembers(
    baseline,
    ['lucy-d', 'edith', 'nina'],
    true
  );
  assert.deepEqual(second.freshIds, ['nina']);
  assert.equal(
    bellRubricPoints({
      memberIds: ['lucy-d', 'edith', 'nina'],
      freshIds: second.freshIds,
    }),
    2
  );
});

test('capture : 4× 1er mot + 1 like neuf + 2 refus stock + 4 messages → badge 4', () => {
  const firstIds = ['sabine', 'lucy', 'alexandra', 'sandrine'];
  const people = resolveDigestPeople(firstIds, {
    sabine: 'Sabine',
    lucy: 'Lucy',
    alexandra: 'Alexandra',
    sandrine: 'Sandrine',
  });
  assert.deepEqual(
    people.map((p) => p.name),
    ['Sabine', 'Lucy', 'Alexandra', 'Sandrine']
  );
  const declined = observeRubricMembers(
    { primed: false, seen: new Set() },
    ['edith', 'other-decline'],
    true
  );
  const total = bellHeaderBadgeCount({
    rubrics: [
      { memberIds: ['new-like'], freshIds: ['new-like'] },
      { memberIds: [], freshIds: [] },
      { memberIds: firstIds, freshIds: [] },
      {
        memberIds: ['edith', 'other-decline'],
        freshIds: declined.freshIds,
      },
    ],
    unreadMessageCount: 4,
  });
  assert.equal(bellRubricPoints({ memberIds: ['new-like'], freshIds: ['new-like'] }), 1);
  assert.equal(bellRubricPoints({ memberIds: firstIds, freshIds: [] }), 1);
  assert.equal(
    bellRubricPoints({
      memberIds: ['edith', 'other-decline'],
      freshIds: declined.freshIds,
    }),
    1
  );
  assert.equal(total, 4);
});

test('Patrick Amiens : 4× 1er mot anciens + 1 message = 2, pas 5', () => {
  const firstIds = ['sabine', 'autre', 'samantha', 'sandrine'];
  const unreadMatchCreated = firstIds.map((id) => ({
    kind: 'match_created',
    actor_id: id,
    read_at: null,
  }));
  const wronglyFresh = bellRubricFreshIds({
    unreadItems: unreadMatchCreated,
    unreadKinds: BELL_RUBRIC_UNREAD_KINDS.first,
  });
  assert.equal(wronglyFresh.length, 4);
  assert.equal(
    bellHeaderBadgeCount({
      rubrics: [{ memberIds: firstIds, freshIds: wronglyFresh }],
      unreadMessageCount: 1,
    }),
    5
  );

  const baseline = { primed: false, seen: new Set<string>() };
  const split = observeRubricMembers(baseline, firstIds, true);
  assert.deepEqual(split.freshIds, []);
  assert.equal(
    bellRubricPoints({ memberIds: firstIds, freshIds: split.freshIds }),
    1
  );
  assert.equal(
    bellHeaderBadgeCount({
      rubrics: [
        { memberIds: [], freshIds: [] },
        { memberIds: [], freshIds: [] },
        { memberIds: firstIds, freshIds: split.freshIds },
      ],
      unreadMessageCount: 1,
    }),
    2
  );
});

test('À découvrir : 4 anciens = 1 ; +2 nouveaux après consultation = 3', () => {
  const baseline = { primed: false, seen: new Set<string>() };
  const oldIds = ['a', 'b', 'c', 'd'];
  const first = observeRubricMembers(baseline, oldIds, true);
  assert.deepEqual(first.freshIds, []);
  assert.equal(
    bellRubricPoints({ memberIds: oldIds, freshIds: first.freshIds }),
    1
  );
  const grown = ['a', 'b', 'c', 'd', 'e', 'f'];
  const second = observeRubricMembers(baseline, grown, true);
  assert.deepEqual(second.freshIds, ['e', 'f']);
  assert.equal(
    bellRubricPoints({ memberIds: grown, freshIds: second.freshIds }),
    3
  );
  absorbRubricConsultation(baseline, grown);
  const afterOpen = observeRubricMembers(baseline, grown, true);
  assert.deepEqual(afterOpen.freshIds, []);
  assert.equal(
    bellRubricPoints({ memberIds: grown, freshIds: afterOpen.freshIds }),
    1
  );
});

test('observeRubricMembers : liste vide ne prime pas (évite 4 « nouveaux » au chargement)', () => {
  const baseline = { primed: false, seen: new Set<string>() };
  const empty = observeRubricMembers(baseline, [], true);
  assert.equal(baseline.primed, false);
  assert.deepEqual(empty.freshIds, []);
  const loaded = observeRubricMembers(
    baseline,
    ['sabine', 'autre', 'samantha', 'sandrine'],
    true
  );
  assert.deepEqual(loaded.freshIds, []);
  assert.equal(loaded.stockIds.length, 4);
});
