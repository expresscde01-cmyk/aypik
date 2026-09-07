import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isChromiumInstallBrowser,
  isIosInstallManual,
  isStandaloneDisplay,
  resolvePwaInstallKind,
} from './pwaInstall.ts';

test('déjà en standalone : le bouton d’install est masqué', () => {
  assert.equal(isStandaloneDisplay({ displayModeStandalone: true }), true);
  assert.equal(isStandaloneDisplay({ iosStandalone: true }), true);
  assert.equal(
    resolvePwaInstallKind({
      standalone: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0',
      canPrompt: true,
    }),
    'hidden'
  );
});

test('iPhone / iPad : instructions manuelles, jamais prompt Chrome', () => {
  assert.equal(
    isIosInstallManual(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    ),
    true
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/128.0.0.0',
      canPrompt: true,
    }),
    'ios-manual'
  );
  assert.equal(
    isIosInstallManual(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      5
    ),
    true
  );
});

test('Chrome / Edge : bouton natif dès que beforeinstallprompt est là', () => {
  assert.equal(
    isChromiumInstallBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Edg/128.0.0.0'
    ),
    true
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36',
      canPrompt: true,
    }),
    'native'
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36',
      canPrompt: false,
    }),
    'pending'
  );
});

test('Firefox : pas de bouton d’install (pas d’API utile)', () => {
  assert.equal(
    isChromiumInstallBrowser(
      'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0'
    ),
    false
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent:
        'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
      canPrompt: false,
    }),
    'hidden'
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      maxTouchPoints: 0,
      canPrompt: false,
    }),
    'hidden'
  );
});
