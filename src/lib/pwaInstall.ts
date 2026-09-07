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
      buttonLabel: 'Comment l’ajouter à l’écran d’accueil',
      steps: [
        'Appuie sur le bouton Partager (carré avec une flèche) en bas de Safari.',
        'Choisis Sur l’écran d’accueil.',
        'Valide avec Ajouter.',
      ],
    };
  }
  if (kind === 'firefox-android-manual') {
    return {
      buttonLabel: 'Comment l’ajouter à l’écran d’accueil',
      steps: [
        'Appuie sur le menu (trois points) en haut à droite.',
        'Choisis Installer — ou Ajouter à l’écran d’accueil, selon la version de Firefox.',
        'Confirme l’ajout sur l’écran d’accueil.',
      ],
    };
  }
  if (kind === 'safari-macos-manual') {
    return {
      buttonLabel: 'Comment l’ajouter au Dock',
      steps: [
        'Dans la barre de menus, ouvre Fichier.',
        'Choisis Ajouter au Dock (macOS Sonoma 14 et suivants). Tu peux aussi utiliser le bouton Partager de Safari, puis Ajouter au Dock.',
        'Vérifie le nom, puis clique sur Ajouter.',
      ],
    };
  }
  return null;
}

/** Bouton natif Chromium : même test Android que le reste du module. */
export function pwaNativeButtonLabel(ua: string): string {
  if (/android/i.test(ua)) return 'Ajouter Aypik à l’écran d’accueil';
  return 'Ajouter Aypik au bureau';
}

export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
