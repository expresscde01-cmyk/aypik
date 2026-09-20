import assert from 'node:assert/strict';
import { test } from 'node:test';
import { i18n } from '../i18n/t.ts';
import {
  MAX_TEMPERAMENT,
  sanitizeTemperament,
  orderTemperamentKeys,
  getTemperamentLabel,
} from './temperament.ts';

test('sanitizeTemperament : clés connues, sans doublon, 5 max', () => {
  assert.deepEqual(sanitizeTemperament(['calm', 'calm', 'nope', 'curious']), [
    'calm',
    'curious',
  ]);
  assert.equal(
    sanitizeTemperament([
      'calm',
      'settled',
      'dynamic',
      'hyper',
      'homebody',
      'introvert',
    ]).length,
    MAX_TEMPERAMENT
  );
  assert.deepEqual(sanitizeTemperament(null), []);
  assert.deepEqual(sanitizeTemperament(['  warm  ']), ['warm']);
});

test('orderTemperamentKeys : rubriques puis graduation, pas l’ordre de sélection', () => {
  assert.deepEqual(orderTemperamentKeys(['romantic', 'curious', 'homebody']), [
    'homebody',
    'romantic',
    'curious',
  ]);
});

test('getTemperamentLabel : accord selon le genre du profil, EN sans accord', () => {
  assert.equal(getTemperamentLabel('homebody', 'femme', 'fr'), 'Casanière');
  assert.equal(getTemperamentLabel('homebody', 'homme', 'fr'), 'Casanier');
  assert.equal(getTemperamentLabel('homebody', null, 'fr'), 'Casanier');
  assert.equal(getTemperamentLabel('thinker', 'femme', 'fr'), 'Penseuse');
  assert.equal(getTemperamentLabel('thinker', 'homme', 'es'), 'Pensador');
  assert.equal(getTemperamentLabel('thinker', 'femme', 'es'), 'Pensadora');
  assert.equal(getTemperamentLabel('homebody', 'femme', 'en'), 'Homebody');
  assert.equal(getTemperamentLabel('homebody', 'homme', 'en'), 'Homebody');
  i18n.changeLanguage('fr');
});
