import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatE164ForDisplay,
  phoneVerificationPrefixes,
  toE164Phone,
} from './phone.ts';

test('France par défaut : mobile national vers E.164', () => {
  assert.equal(toE164Phone('06 12 34 56 78', 'FR'), '+33612345678');
  assert.equal(formatE164ForDisplay('+33612345678'), '+33 6 12 34 56 78');
});

test('Belgique : numéro national accepté', () => {
  assert.equal(toE164Phone('0450 00 12 34', 'BE'), '+32450001234');
});

test('Saint-Barthélemy partage le plan +590 de la Guadeloupe', () => {
  assert.equal(toE164Phone('0690 00 12 34', 'BL'), '+590690001234');
  assert.equal(toE164Phone('0690 00 12 34', 'GP'), '+590690001234');
});

test('La Réunion et Mayotte sont hors liste', () => {
  assert.equal(toE164Phone('0692 12 34 56', 'RE' as 'FR'), null);
  assert.equal(toE164Phone('0639 01 23 45', 'YT' as 'FR'), null);
});

test('un pays hors liste est refusé', () => {
  assert.equal(
    toE164Phone('202 555 0123', 'US' as 'FR'),
    null
  );
  assert.equal(toE164Phone('+1 202 555 0123', 'FR'), null);
});

test('les indicatifs uniques couvrent la liste, sans doublon', () => {
  const prefixes = phoneVerificationPrefixes();
  assert.equal(prefixes[0], '+33');
  assert.equal(new Set(prefixes).size, prefixes.length);
  assert.equal(prefixes.includes('+590'), true);
  assert.equal(prefixes.includes('+262'), false);
  assert.equal(prefixes.includes('+1'), false);
  assert.equal(prefixes.length, 41);
});
