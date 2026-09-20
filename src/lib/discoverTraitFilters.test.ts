import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_TEMPERAMENT_FILTER_KEYS,
  isLanguageFilterActive,
  isTemperamentFilterActive,
  profileMatchesLanguageFilter,
  profileMatchesTemperamentFilter,
  sanitizeLanguageFilterCodes,
  sanitizeMinLanguageLevel,
  sanitizeTemperamentFilter,
  temperamentFilterKeyCount,
} from './discoverTraitFilters.ts';

test('filtre tempérament vide : aucun effet, y compris profil sans données', () => {
  assert.equal(profileMatchesTemperamentFilter(null, {}), true);
  assert.equal(profileMatchesTemperamentFilter([], {}), true);
  assert.equal(profileMatchesTemperamentFilter(['calm'], {}), true);
  assert.equal(isTemperamentFilterActive({}), false);
});

test('filtre tempérament : OU dans une famille', () => {
  const filter = { energy: ['calm', 'dynamic'] };
  assert.equal(profileMatchesTemperamentFilter(['calm'], filter), true);
  assert.equal(profileMatchesTemperamentFilter(['dynamic', 'funny'], filter), true);
  assert.equal(profileMatchesTemperamentFilter(['hyper'], filter), false);
});

test('filtre tempérament : ET entre familles', () => {
  const filter = { energy: ['calm'], heart: ['tender'] };
  assert.equal(
    profileMatchesTemperamentFilter(['calm', 'tender'], filter),
    true
  );
  assert.equal(profileMatchesTemperamentFilter(['calm', 'warm'], filter), false);
  assert.equal(profileMatchesTemperamentFilter(['tender'], filter), false);
});

test('filtre tempérament : famille sans choix ignorée', () => {
  const filter = { energy: ['calm'], social: [] };
  assert.equal(profileMatchesTemperamentFilter(['calm'], filter), true);
  assert.equal(profileMatchesTemperamentFilter(['introvert'], filter), false);
});

test('filtre tempérament actif : profil NULL ou vide exclu', () => {
  const filter = { energy: ['calm'] };
  assert.equal(profileMatchesTemperamentFilter(null, filter), false);
  assert.equal(profileMatchesTemperamentFilter([], filter), false);
});

test('filtre tempérament : clés inconnues ignorées, plafond 30', () => {
  assert.deepEqual(sanitizeTemperamentFilter({ energy: ['nope', 'calm'] }), {
    energy: ['calm'],
  });
  assert.equal(sanitizeTemperamentFilter({ nope: ['calm'] }).energy, undefined);
  const flood = {
    energy: ['calm', 'calm', 'nope', 'settled', 'dynamic', 'hyper'],
    social: ['homebody', 'introvert', 'sociable', 'extrovert', 'needs_company'],
    communication: ['discreet', 'listener', 'communicative', 'talkative'],
    heart: ['distant', 'empathic', 'sensitive', 'tender', 'warm', 'romantic'],
    mind: ['rational', 'thinker', 'curious', 'creative', 'funny'],
    attitude: ['organized', 'mature', 'spontaneous', 'adventurous', 'carefree'],
  };
  const n = temperamentFilterKeyCount(sanitizeTemperamentFilter(flood));
  assert.ok(n <= MAX_TEMPERAMENT_FILTER_KEYS);
  assert.equal(n, 29);
});

test('filtre langues vide : aucun effet', () => {
  assert.equal(profileMatchesLanguageFilter(null, []), true);
  assert.equal(profileMatchesLanguageFilter([], ['xx']), true);
  assert.equal(isLanguageFilterActive([]), false);
  assert.equal(isLanguageFilterActive(['zz']), false);
});

test('filtre langues : niveau minimum seul sans langues = aucun effet', () => {
  const spoken = [{ code: 'fr' as const, level: 'beginner' as const }];
  assert.equal(profileMatchesLanguageFilter(spoken, [], 'native'), true);
  assert.equal(profileMatchesLanguageFilter(null, [], 'native'), true);
});

test('filtre langues : au moins une langue au niveau minimum', () => {
  const spoken = [
    { code: 'fr' as const, level: 'beginner' as const },
    { code: 'en' as const, level: 'advanced' as const },
  ];
  assert.equal(profileMatchesLanguageFilter(spoken, ['fr'], 'all'), true);
  assert.equal(profileMatchesLanguageFilter(spoken, ['en', 'es'], 'all'), true);
  assert.equal(
    profileMatchesLanguageFilter(spoken, ['en'], 'advanced'),
    true
  );
  assert.equal(profileMatchesLanguageFilter(spoken, ['en'], 'native'), false);
  assert.equal(
    profileMatchesLanguageFilter(spoken, ['fr'], 'intermediate'),
    false
  );
  assert.equal(profileMatchesLanguageFilter(spoken, ['es'], 'all'), false);
});

test('filtre langues actif : profil sans langues exclu', () => {
  assert.equal(profileMatchesLanguageFilter(null, ['fr'], 'all'), false);
  assert.equal(profileMatchesLanguageFilter([], ['fr'], 'all'), false);
});

test('filtre langues : codes et niveau inconnus ignorés, 8 max', () => {
  assert.deepEqual(sanitizeLanguageFilterCodes(['FR', 'xx', 'en', 'fr']), [
    'fr',
    'en',
  ]);
  assert.equal(sanitizeMinLanguageLevel('nope'), 'all');
  assert.equal(sanitizeMinLanguageLevel('native'), 'native');
  const many = Array.from({ length: 12 }, (_, i) =>
    ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'nl', 'pl', 'ru', 'zh', 'ja'][i]
  );
  assert.equal(sanitizeLanguageFilterCodes(many).length, 8);
});
