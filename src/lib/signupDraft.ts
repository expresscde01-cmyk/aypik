export type SignupDraft = {
  signupStep: 'offer' | 'profile';
  offerUnlocked: boolean;
  displayName: string;
  birthDate: string;
  bio: string;
  hasChildren: boolean;
  location: string;
  locationSelected: boolean;
  interests: string[];
  photoUrl: string;
};

function draftKey(userId: string) {
  return `aypik_signup_draft_${userId}`;
}

export function readSignupDraft(userId: string): SignupDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SignupDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      signupStep: parsed.signupStep === 'profile' ? 'profile' : 'offer',
      offerUnlocked: Boolean(parsed.offerUnlocked),
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      birthDate: typeof parsed.birthDate === 'string' ? parsed.birthDate : '',
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
      hasChildren: Boolean(parsed.hasChildren),
      location: typeof parsed.location === 'string' ? parsed.location : '',
      locationSelected: Boolean(parsed.locationSelected),
      interests: Array.isArray(parsed.interests)
        ? parsed.interests.filter((i): i is string => typeof i === 'string')
        : [],
      photoUrl: typeof parsed.photoUrl === 'string' ? parsed.photoUrl : '',
    };
  } catch {
    return null;
  }
}

export function writeSignupDraft(userId: string, draft: SignupDraft) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function clearSignupDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // ignore
  }
}

function pauseKey(userId: string) {
  return `aypik_signup_paused_${userId}`;
}

/** Met l’inscription en pause sans déconnecter (Retour depuis les offres). */
export function pauseSignup(userId: string) {
  try {
    localStorage.setItem(pauseKey(userId), '1');
  } catch {
    // ignore
  }
}

export function resumeSignup(userId: string) {
  try {
    localStorage.removeItem(pauseKey(userId));
  } catch {
    // ignore
  }
}

export function isSignupPaused(userId: string): boolean {
  try {
    return localStorage.getItem(pauseKey(userId)) === '1';
  } catch {
    return false;
  }
}
