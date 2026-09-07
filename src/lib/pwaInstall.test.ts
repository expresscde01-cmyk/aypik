import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isChromiumInstallBrowser,
  isFirefoxAndroid,
  isIosSafari,
  isSafariMacos,
  isStandaloneDisplay,
  pwaManualGuide,
  pwaNativeButtonLabel,
  resolvePwaInstallKind,
} from './pwaInstall.ts';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36';
const CHROME_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
const FIREFOX_ANDROID =
  'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0';
const FIREFOX_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0.0.0 Mobile/15E148 Safari/604.1';

test('déjà en standalone : le bouton d’install est masqué', () => {
  assert.equal(isStandaloneDisplay({ displayModeStandalone: true }), true);
  assert.equal(isStandaloneDisplay({ iosStandalone: true }), true);
  assert.equal(
    resolvePwaInstallKind({
      standalone: true,
      userAgent: CHROME_ANDROID,
      canPrompt: true,
    }),
    'hidden'
  );
});

test('Safari iPhone / iPad : instructions manuelles, jamais prompt Chrome', () => {
  assert.equal(isIosSafari(SAFARI_IOS), true);
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent: SAFARI_IOS,
      canPrompt: true,
    }),
    'ios-manual'
  );
  assert.equal(
    isIosSafari(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      5
    ),
    true
  );
  const guide = pwaManualGuide('ios-manual');
  assert.ok(guide?.steps.some((step) => /écran d’accueil/i.test(step)));
});

test('Chrome / Firefox / Edge iOS : pas d’ajout à l’écran d’accueil, carte masquée', () => {
  assert.equal(isIosSafari(CHROME_IOS), false);
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent: CHROME_IOS,
      canPrompt: true,
    }),
    'hidden'
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FxiOS/128.0 Mobile/15E148 Safari/604.1',
      canPrompt: false,
    }),
    'hidden'
  );
});

test('Chrome / Edge : libellé natif selon Android ou ordinateur', () => {
  assert.equal(
    pwaNativeButtonLabel(CHROME_ANDROID),
    'Ajouter Aypik à l’écran d’accueil'
  );
  assert.equal(
    pwaNativeButtonLabel(CHROME_DESKTOP),
    'Ajouter Aypik au bureau'
  );
  assert.equal(
    pwaNativeButtonLabel(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Edg/128.0.0.0'
    ),
    'Ajouter Aypik au bureau'
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
      userAgent: CHROME_ANDROID,
      canPrompt: true,
    }),
    'native'
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent: CHROME_ANDROID,
      canPrompt: false,
    }),
    'pending'
  );
});

test('Firefox Android : instructions menu Installer / Ajouter à l’écran d’accueil', () => {
  assert.equal(isFirefoxAndroid(FIREFOX_ANDROID), true);
  assert.equal(isFirefoxAndroid(FIREFOX_DESKTOP), false);
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent: FIREFOX_ANDROID,
      canPrompt: false,
    }),
    'firefox-android-manual'
  );
  const guide = pwaManualGuide('firefox-android-manual');
  assert.match(guide?.steps.join(' ') || '', /Installer/);
  assert.match(guide?.steps.join(' ') || '', /Ajouter à l’écran d’accueil/);
});

test('Safari macOS : instructions Ajouter au Dock (Sonoma+)', () => {
  assert.equal(isSafariMacos(SAFARI_MAC, 0), true);
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent: SAFARI_MAC,
      maxTouchPoints: 0,
      canPrompt: false,
    }),
    'safari-macos-manual'
  );
  const guide = pwaManualGuide('safari-macos-manual');
  assert.match(guide?.steps.join(' ') || '', /Ajouter au Dock/);
  assert.match(guide?.steps.join(' ') || '', /Sonoma/);
});

test('Firefox desktop : pas d’install native, carte masquée', () => {
  assert.equal(
    isChromiumInstallBrowser(FIREFOX_ANDROID),
    false
  );
  assert.equal(
    resolvePwaInstallKind({
      standalone: false,
      userAgent: FIREFOX_DESKTOP,
      canPrompt: false,
    }),
    'hidden'
  );
  assert.equal(pwaManualGuide('hidden'), null);
});
