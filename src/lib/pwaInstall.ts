import { t } from '../i18n/t.ts';

/** Détection install PWA (prompt Chromium vs instructions manuelles vs masqué). */

export type PwaInstallKind =
  | 'hidden'
  | 'native'
  | 'pending'
  | 'ios-manual'
  | 'firefox-android-manual'
  | 'safari-macos-manual';

export type PwaManualGuide = {
  buttonLabel: string;
  steps: string[];
};

export function isStandaloneDisplay(input: {
  displayModeStandalone?: boolean;
  iosStandalone?: boolean;
}): boolean {
  return Boolean(input.displayModeStandalone || input.iosStandalone);
}

export function isIosDevice(ua: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipod|ipad/i.test(ua)) return true;
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  return false;
}

/** Safari iOS / iPadOS uniquement (pas Chrome, Firefox ou Edge iOS). */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  if (!isIosDevice(ua, maxTouchPoints)) return false;
  return !/crios|fxios|edgios|edga/i.test(ua);
}

export function isFirefoxAndroid(ua: string): boolean {
  if (!/android/i.test(ua)) return false;
  if (/fxios/i.test(ua)) return false;
  return /firefox/i.test(ua);
}

/** Safari macOS (pas iPad). Ajouter au Dock : macOS Sonoma 14+. */
export function isSafariMacos(ua: string, maxTouchPoints = 0): boolean {
  if (isIosDevice(ua, maxTouchPoints)) return false;
  if (!/macintosh/i.test(ua)) return false;
  if (/chrome|chromium|edg\/|firefox|crios|fxios/i.test(ua)) return false;
  return /safari/i.test(ua) && /version\//i.test(ua);
}

/** Chromium (Chrome, Edge, Samsung) hors Firefox. */
export function isChromiumInstallBrowser(ua: string): boolean {
  const u = ua.toLowerCase();
  if (/firefox|fxios/.test(u)) return false;
  return /edg\/|edga\/|edgios\/|chrome\/|chromium|crios|samsungbrowser/.test(u);
}

export function resolvePwaInstallKind(input: {
  standalone: boolean;
  userAgent: string;
  maxTouchPoints?: number;
  canPrompt: boolean;
}): PwaInstallKind {
  if (input.standalone) return 'hidden';
  const touch = input.maxTouchPoints ?? 0;
  const ua = input.userAgent;
  if (isIosSafari(ua, touch)) return 'ios-manual';
  if (isIosDevice(ua, touch)) return 'hidden';
  if (isFirefoxAndroid(ua)) return 'firefox-android-manual';
  if (isSafariMacos(ua, touch)) return 'safari-macos-manual';
  if (input.canPrompt) return 'native';
  if (isChromiumInstallBrowser(ua)) return 'pending';
  return 'hidden';
}

export function pwaManualGuide(kind: PwaInstallKind): PwaManualGuide | null {
  if (kind === 'ios-manual') {
    return {
      buttonLabel: t('common.pwa.iosButton'),
      steps: [
        t('common.pwa.iosStep1'),
        t('common.pwa.iosStep2'),
        t('common.pwa.iosStep3'),
      ],
    };
  }
  if (kind === 'firefox-android-manual') {
    return {
      buttonLabel: t('common.pwa.iosButton'),
      steps: [
        t('common.pwa.firefoxStep1'),
        t('common.pwa.firefoxStep2'),
        t('common.pwa.firefoxStep3'),
      ],
    };
  }
  if (kind === 'safari-macos-manual') {
    return {
      buttonLabel: t('common.pwa.safariMacButton'),
      steps: [
        t('common.pwa.safariMacStep1'),
        t('common.pwa.safariMacStep2'),
        t('common.pwa.safariMacStep3'),
      ],
    };
  }
  return null;
}

/** Bouton natif Chromium : même test Android que le reste du module. */
export function pwaNativeButtonLabel(ua: string): string {
  if (/android/i.test(ua)) return t('common.pwa.nativeMobile');
  return t('common.pwa.nativeDesktop');
}

export function pwaNativeWaitingLabel(): string {
  return t('common.pwa.waiting');
}

export function pwaNativeWaitingHint(): string {
  return t('common.pwa.waitingHint');
}

export function pwaInstallDescription(ua: string, maxTouchPoints = 0): string {
  if (/android/i.test(ua) || isIosDevice(ua, maxTouchPoints)) {
    return t('common.pwa.descMobile');
  }
  return t('common.pwa.descDesktop');
}

export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
