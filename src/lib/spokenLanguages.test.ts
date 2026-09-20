import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNativeLanguageRequired } from './isNativeLanguageRequired.ts';
import {
  hasNativeSpokenLanguage,
  listedLanguageCodes,
  orderSpokenLanguagesForDisplay,
  sanitizeSpokenLanguages,
} from './spokenLanguages.ts';

test('sanitizeSpokenLanguages : niveaux connus, sans doublon, 8 max, sans défaut', () => {
  assert.deepEqual(
    sanitizeSpokenLanguages([
      { code: 'en', level: 'intermediate' },
      { code: 'en', level: 'native' },
      { code: 'xx', level: 'beginner' },
      { code: 'es', level: null },
    ]),
    [{ code: 'en', level: 'intermediate' }]
  );
  assert.deepEqual(sanitizeSpokenLanguages(null), []);
  const many = Array.from({ length: 10 }, (_, i) => ({
    code: ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'nl', 'pl', 'ru'][i],
    level: 'beginner' as const,
  }));
  assert.equal(sanitizeSpokenLanguages(many).length, 8);
});

test('orderSpokenLanguagesForDisplay : maternelles en premier', () => {
  assert.deepEqual(
    orderSpokenLanguagesForDisplay([
      { code: 'en', level: 'intermediate' },
      { code: 'fr', level: 'native' },
      { code: 'es', level: 'beginner' },
    ]),
    [
      { code: 'fr', level: 'native' },
      { code: 'en', level: 'intermediate' },
      { code: 'es', level: 'beginner' },
    ]
  );
});

test('hasNativeSpokenLanguage', () => {
  assert.equal(hasNativeSpokenLanguage([]), false);
  assert.equal(
    hasNativeSpokenLanguage([{ code: 'en', level: 'advanced' }]),
    false
  );
  assert.equal(
    hasNativeSpokenLanguage([{ code: 'fr', level: 'native' }]),
    true
  );
});

test('listedLanguageCodes : sans saisie, vedettes puis alpha', () => {
  const listed = listedLanguageCodes('', 'fr', []);
  assert.deepEqual(listed.slice(0, 7), [
    'fr',
    'en',
    'es',
    'de',
    'it',
    'pt',
    'ar',
  ]);
  assert.ok(listed.indexOf('nl') > listed.indexOf('ar'));
});

test('listedLanguageCodes : filtre sans accents', () => {
  assert.ok(listedLanguageCodes('anglais', 'fr', []).includes('en'));
  assert.ok(listedLanguageCodes('ESPANOL', 'es', []).includes('es'));
});

test('isNativeLanguageRequired : France sans forfait international', () => {
  assert.equal(
    isNativeLanguageRequired({ country_code: 'FR' }, { plan: 'free' }),
    false
  );
});

test('isNativeLanguageRequired : lancement, accès mondial ouvert, pas d’obligation', () => {
  assert.equal(
    isNativeLanguageRequired(
      { country_code: 'FR' },
      { plan: 'free', has_international_access: true }
    ),
    false
  );
  assert.equal(
    isNativeLanguageRequired({ country_code: 'GP' }, { has_international_access: true }),
    false
  );
  assert.equal(
    isNativeLanguageRequired({ country_code: 'CA' }, { has_international_access: true }),
    false
  );
});

test('isNativeLanguageRequired : hors francophonie', () => {
  assert.equal(
    isNativeLanguageRequired({ country_code: 'ES' }, { plan: 'free' }),
    true
  );
});

test('isNativeLanguageRequired : checkout International ou Premium', () => {
  assert.equal(
    isNativeLanguageRequired(
      { country_code: 'FR' },
      { plan: 'essentiel', subscribing: 'international' }
    ),
    true
  );
  assert.equal(
    isNativeLanguageRequired(
      { country_code: 'BE' },
      { plan: 'free', subscribing: 'premium' }
    ),
    true
  );
});
