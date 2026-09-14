import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAUNCH_TICKER_DISMISS_KEY,
  dismissLaunchTicker,
  isLaunchTickerDismissed,
} from './launchTicker.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

test('fermeture du bandeau : mémorisée, pas réaffichée', () => {
  store.clear();
  assert.equal(isLaunchTickerDismissed(), false);
  dismissLaunchTicker();
  assert.equal(store.get(LAUNCH_TICKER_DISMISS_KEY), '1');
  assert.equal(isLaunchTickerDismissed(), true);
});

test('FR/EN/ES : texte de lancement synthétique, sans les trois scénarios', () => {
  for (const file of ['fr.json', 'en.json', 'es.json']) {
    const json = JSON.parse(
      readFileSync(join(root, 'src/locales', file), 'utf8')
    ) as {
      landing: {
        launchTicker: string;
        launchTickerPause: string;
        launchTickerPlay: string;
      };
    };
    assert.ok(json.landing.launchTicker.length > 40);
    assert.equal(typeof json.landing.launchTickerPause, 'string');
    assert.equal(typeof json.landing.launchTickerPlay, 'string');
    const lower = json.landing.launchTicker.toLowerCase();
    assert.equal(lower.includes('arrêt'), false);
    assert.equal(lower.includes('payant'), false);
  }
});
