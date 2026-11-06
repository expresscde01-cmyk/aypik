import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultGreetingNameColor,
  GREETING_NAME_PAINT,
  parseGreetingNameColor,
  resolveGreetingNameColor,
} from './greetingNameColor.ts';

test('la couleur par défaut suit le genre déclaré', () => {
  assert.equal(defaultGreetingNameColor('homme'), 'ciel');
  assert.equal(defaultGreetingNameColor('femme'), 'framboise');
  assert.equal(defaultGreetingNameColor(null), 'lavande');
  assert.equal(defaultGreetingNameColor(''), 'lavande');
  assert.equal(defaultGreetingNameColor('autre'), 'lavande');
});

test('un choix vide retombe sur le défaut, un choix connu est conservé', () => {
  assert.equal(resolveGreetingNameColor(null, 'homme'), 'ciel');
  assert.equal(resolveGreetingNameColor('', 'femme'), 'framboise');
  assert.equal(resolveGreetingNameColor('ocean', 'homme'), 'ocean');
  assert.equal(resolveGreetingNameColor('inconnu', 'femme'), 'framboise');
  assert.equal(parseGreetingNameColor('Nuit'), 'nuit');
});

test('la palette reste les six couleurs prévues', () => {
  assert.deepEqual(Object.keys(GREETING_NAME_PAINT), [
    'ciel',
    'framboise',
    'lavande',
    'corail',
    'ocean',
    'nuit',
  ]);
  assert.equal(GREETING_NAME_PAINT.nuit, '#1B1F3B');
  assert.match(GREETING_NAME_PAINT.ciel, /^linear-gradient\(90deg,/);
});
