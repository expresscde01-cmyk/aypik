import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BOOST_RESERVED_SLOTS,
  boostHourBucket,
  pickBoostedSlots,
  placeBoostsAtGroupHead,
  placeHomeSuggestions,
} from './boostPlacement.ts';
import { sortDiscoveryCandidates } from './discoverySort.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260929190000_founder_boost_credits.sql'),
  'utf8'
);

type Card = {
  id: string;
  is_boosted: boolean;
  group: number;
  distance_km: number;
  mutual_interests: string[];
  created_at: string;
};

function card(id: string, boosted: boolean, group: number): Card {
  return {
    id,
    is_boosted: boosted,
    group,
    distance_km: group * 10 + id.charCodeAt(0),
    mutual_interests: [],
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

const hour = Date.parse('2026-09-29T14:10:00.000Z');
const laterSameHour = Date.parse('2026-09-29T14:50:00.000Z');
const nextHour = Date.parse('2026-09-29T15:10:00.000Z');

test('accueil : 2 places boostées au plus, le reste suit le classement', () => {
  const ranked = [
    card('a', false, 1),
    card('b', false, 1),
    card('c', false, 1),
    card('d', false, 1),
    card('e', false, 1),
    card('f', false, 1),
    card('g', false, 1),
    card('h', false, 1),
    card('i', true, 1),
    card('j', true, 1),
    card('k', true, 1),
  ];
  const shown = placeHomeSuggestions(ranked, 'visitor-a', hour, 8);
  assert.equal(shown.length, 8);
  assert.equal(shown.filter((item) => item.is_boosted).length, BOOST_RESERVED_SLOTS);
  assert.equal(shown[0].is_boosted, true);
  assert.equal(shown[1].is_boosted, true);
  assert.deepEqual(
    shown.slice(2).map((item) => item.id),
    ['a', 'b', 'c', 'd', 'e', 'f']
  );
  assert.ok(shown.every((item) => ranked.some((source) => source.id === item.id)));
});

test('rotation stable pendant l’heure, différente selon le visiteur', () => {
  const boosted = ['b', 'c', 'd', 'e', 'f', 'g'].map((id) => card(id, true, 1));
  const ranked = [card('a', false, 1), ...boosted];
  const first = placeHomeSuggestions(ranked, 'visitor-a', hour, 8);
  const again = placeHomeSuggestions(ranked, 'visitor-a', laterSameHour, 8);
  const other = placeHomeSuggestions(ranked, 'visitor-b', hour, 8);
  assert.deepEqual(
    first.slice(0, 2).map((item) => item.id),
    again.slice(0, 2).map((item) => item.id)
  );
  assert.equal(boostHourBucket(hour), boostHourBucket(laterSameHour));
  assert.notEqual(boostHourBucket(hour), boostHourBucket(nextHour));
  assert.notDeepEqual(
    first.slice(0, 2).map((item) => item.id),
    other.slice(0, 2).map((item) => item.id)
  );
});

test('Découvrir : 2 places en tête du groupe, sans changer de groupe', () => {
  const ordered = [
    card('city-plain', false, 1),
    card('city-boost-1', true, 1),
    card('city-boost-2', true, 1),
    card('city-boost-3', true, 1),
    card('dept-plain', false, 2),
    card('dept-boost', true, 2),
  ];
  const placed = placeBoostsAtGroupHead(
    ordered,
    (item) => item.group,
    'visitor-a',
    hour
  );
  const city = placed.filter((item) => item.group === 1);
  const dept = placed.filter((item) => item.group === 2);
  assert.equal(city.filter((item) => item.is_boosted).slice(0, 2).length, 2);
  assert.equal(city[0].is_boosted, true);
  assert.equal(city[1].is_boosted, true);
  assert.equal(city.filter((item) => item.is_boosted).length, 3);
  assert.ok(placed.indexOf(city[city.length - 1]) < placed.indexOf(dept[0]));
  assert.equal(dept[0].id, 'dept-boost');
  assert.ok(dept.every((item) => item.group === 2));
});

test('tri choisi : le Boost ne remonte personne', () => {
  const near = {
    id: 'near',
    is_boosted: false,
    distance_km: 2,
    mutual_interests: ['a'],
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const farBoosted = {
    id: 'far',
    is_boosted: true,
    distance_km: 80,
    mutual_interests: ['a', 'b'],
    created_at: '2026-06-01T00:00:00.000Z',
  };
  const sorted = sortDiscoveryCandidates([farBoosted, near], 'distance', 6);
  assert.equal(sorted[0].id, 'near');
});

test('le Boost ne fait pas entrer un profil hors filtres', () => {
  const filtered = [card('kept', false, 1)];
  const shown = placeHomeSuggestions(filtered, 'visitor-a', hour, 8);
  assert.deepEqual(shown.map((item) => item.id), ['kept']);
});

test('un 3e profil boosté hors du classement naturel sort des 8 suggestions', () => {
  const natural = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
    card(id, false, 1)
  );
  const boosted = [card('x', true, 1), card('y', true, 1), card('z', true, 1)];
  const shown = placeHomeSuggestions(natural, 'visitor-a', hour, 8, boosted);
  assert.equal(shown.length, 8);
  assert.equal(shown.filter((item) => item.is_boosted).length, BOOST_RESERVED_SLOTS);
  const dropped = boosted.find((item) => !shown.some((row) => row.id === item.id));
  assert.ok(dropped);
  assert.equal(shown.some((item) => item.id === dropped.id), false);
  assert.deepEqual(
    shown.slice(2).map((item) => item.id),
    ['a', 'b', 'c', 'd', 'e', 'f']
  );
});

test('le 3e boosté ne passe pas devant dans son groupe', () => {
  const pool = [card('s1', true, 1), card('s2', true, 1), card('late', true, 1)];
  const chosen = pickBoostedSlots(pool, 'visitor-a', hour);
  const loser = pool.find((item) => !chosen.some((slot) => slot.id === item.id));
  assert.ok(loser);
  const ordered = [
    card('near', false, 1),
    card('mid', false, 1),
    card(loser.id, true, 1),
  ];
  const placed = placeBoostsAtGroupHead(
    ordered,
    (item) => item.group,
    'visitor-a',
    hour,
    BOOST_RESERVED_SLOTS,
    pool
  );
  const group = placed.filter((item) => item.group === 1);
  const nearAt = group.findIndex((item) => item.id === 'near');
  const loserAt = group.findIndex((item) => item.id === loser.id);
  assert.ok(nearAt >= 0);
  assert.ok(loserAt > nearAt);
  assert.ok(group.findIndex((item) => item.id === chosen[0].id) < nearAt);
});

test('un profil boosté hors des 500 peut obtenir une des 2 places', () => {
  const ordered = [card('dept-a', false, 2), card('dept-b', false, 2)];
  const outside = card('city-boost', true, 1);
  const placed = placeBoostsAtGroupHead(
    ordered,
    (item) => item.group,
    'visitor-a',
    hour,
    BOOST_RESERVED_SLOTS,
    [outside]
  );
  assert.equal(placed[0].id, 'city-boost');
  assert.equal(placed.filter((item) => item.is_boosted).length, 1);
  assert.ok(placed.some((item) => item.id === 'dept-a'));
  assert.equal(placed.filter((item) => item.id === 'city-boost').length, 1);
});

test('la migration retire le Boost d’un mois et crédite 2 Boosts au passage au payant', () => {
  assert.equal(migration.includes('grant_founder_first_month_boost(p_user_id)'), false);
  assert.equal(migration.includes('THEN 25'), false);
  assert.equal(migration.includes('g.boosted DESC'), false);
  assert.match(migration, /amount_cents = 0/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /founder_boosts_remaining = 2/);
  assert.match(migration, /founder_boosts_expire_at IS NULL/);
  assert.match(migration, /interval '6 months'/);
  assert.match(migration, /p_boosted_only/);
  assert.match(migration, /GREATEST\(ends_at, now\(\)\) \+ interval '24 hours'/);
});
