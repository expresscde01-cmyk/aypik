export const LAUNCH_TICKER_DISMISS_KEY = 'aypik:launch-ticker-dismissed';

export function isLaunchTickerDismissed(): boolean {
  try {
    return localStorage.getItem(LAUNCH_TICKER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissLaunchTicker(): void {
  try {
    localStorage.setItem(LAUNCH_TICKER_DISMISS_KEY, '1');
  } catch {
    /* quota / mode privé */
  }
}
