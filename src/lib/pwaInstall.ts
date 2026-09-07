/** Détection install PWA (Chrome/Edge natif vs iOS manuel vs déjà installé). */

export type PwaInstallKind = 'hidden' | 'native' | 'pending' | 'ios-manual';

export function isStandaloneDisplay(input: {
  displayModeStandalone?: boolean;
  iosStandalone?: boolean;
}): boolean {
  return Boolean(input.displayModeStandalone || input.iosStandalone);
}

/** Safari / Chrome iOS : pas d’API beforeinstallprompt. */
export function isIosInstallManual(ua: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipod|ipad/i.test(ua)) return true;
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  return false;
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
  if (isIosInstallManual(input.userAgent, input.maxTouchPoints ?? 0)) {
    return 'ios-manual';
  }
  if (input.canPrompt) return 'native';
  if (isChromiumInstallBrowser(input.userAgent)) return 'pending';
  return 'hidden';
}

export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
