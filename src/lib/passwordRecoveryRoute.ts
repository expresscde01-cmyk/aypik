export type RecoveryToken = {
  tokenHash: string;
  type: 'recovery' | 'magiclink';
};

function paramsFromLocation(): URLSearchParams {
  const query = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return query;
  const fromHash = new URLSearchParams(hash);
  fromHash.forEach((value, key) => {
    if (!query.has(key)) query.set(key, value);
  });
  return query;
}

export function getRecoveryTokenFromUrl(): RecoveryToken | null {
  if (typeof window === 'undefined') return null;
  const params = paramsFromLocation();
  const tokenHash = params.get('token_hash') || params.get('token');
  if (!tokenHash) return null;
  const rawType = (params.get('type') || 'recovery').toLowerCase();
  const type = rawType === 'magiclink' ? 'magiclink' : 'recovery';
  return { tokenHash, type };
}

/**
 * Écran après arrivée sur /?reset=1&type=recovery&token_hash=…
 * La page « Nouveau mot de passe » ne dépend pas d’une session déjà ouverte :
 * un lien refusé, expiré ou déjà utilisé reste sur cet écran, pas sur l’accueil.
 */
export function appScreenForSession(opts: {
  loading: boolean;
  passwordRecovery: boolean;
  hasSession: boolean;
}): 'loading' | 'recovery' | 'app' | 'landing' {
  if (opts.loading) return 'loading';
  if (opts.passwordRecovery) return 'recovery';
  if (opts.hasSession) return 'app';
  return 'landing';
}

export type RecoveryLinkFailure = 'locked' | 'invalid';

/** Une seule vérification : pas de second essai. Le message suit l'erreur. */
export function recoveryLinkFailure(error: {
  message?: string;
  code?: string;
} | null): RecoveryLinkFailure | null {
  if (!error) return null;
  const blob = `${error.code ?? ''}\n${error.message ?? ''}`.toLowerCase();
  if (blob.includes('account_locked')) return 'locked';
  return 'invalid';
}
