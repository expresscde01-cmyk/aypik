import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detailedDiscoverAllowed,
  planIncludesDetailedDiscover,
  resolveDiscoverMode,
} from './discoverMode.ts';

test('Confort et Premium incluent le mode Détaillé', () => {
  assert.equal(planIncludesDetailedDiscover('confort'), true);
  assert.equal(planIncludesDetailedDiscover('premium'), true);
  assert.equal(planIncludesDetailedDiscover('free'), false);
  assert.equal(planIncludesDetailedDiscover('basique'), false);
  assert.equal(planIncludesDetailedDiscover('essentiel'), false);
  assert.equal(planIncludesDetailedDiscover(null), false);
});

test('pendant le lancement, Détaillé reste ouvert pour toutes les offres', () => {
  for (const plan of ['free', 'basique', 'essentiel', 'confort', 'premium', null]) {
    assert.equal(detailedDiscoverAllowed(plan, true), true);
    assert.equal(resolveDiscoverMode('detaille', plan, true), 'detaille');
  }
});

test('en mode payant, Gratuit, Basique et Essentiel sont forcés en Simplifié', () => {
  for (const plan of ['free', 'basique', 'essentiel', null]) {
    assert.equal(detailedDiscoverAllowed(plan, false), false);
    assert.equal(resolveDiscoverMode('detaille', plan, false), 'simplifie');
    assert.equal(resolveDiscoverMode('simplifie', plan, false), 'simplifie');
  }
});

test('en mode payant, Confort et Premium ouvrent en Détaillé et peuvent choisir Simplifié', () => {
  for (const plan of ['confort', 'premium']) {
    assert.equal(detailedDiscoverAllowed(plan, false), true);
    assert.equal(resolveDiscoverMode(null, plan, false), 'detaille');
    assert.equal(resolveDiscoverMode('detaille', plan, false), 'detaille');
    assert.equal(resolveDiscoverMode('simplifie', plan, false), 'simplifie');
  }
});

test('tant que l’offre charge, le mode enregistré n’est pas écrasé', () => {
  assert.equal(resolveDiscoverMode('detaille', 'free', false, true), 'detaille');
  assert.equal(resolveDiscoverMode('simplifie', 'premium', false, true), 'simplifie');
});
