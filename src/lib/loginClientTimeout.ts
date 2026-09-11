import { t } from '../i18n/t.ts';

/** Garde-fou d’affichage uniquement — n’altère pas le timing d’égalisation serveur. */
export const LOGIN_CLIENT_TIMEOUT_MS = 12_000;

export function loginTimeoutMessage(): string {
  return t('auth.loginTimeout');
}

export class LoginClientTimeoutError extends Error {
  constructor() {
    super(t('auth.loginTimeout'));
    this.name = 'LoginClientTimeoutError';
  }
}

export function isLoginClientTimeout(err: unknown): boolean {
  return (
    err instanceof LoginClientTimeoutError ||
    (err instanceof Error && err.name === 'LoginClientTimeoutError')
  );
}

export function withClientTimeout<T>(
  promise: Promise<T>,
  ms: number = LOGIN_CLIENT_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LoginClientTimeoutError());
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
