import { Pause, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFounderSlots } from '@/lib/useFounderSlots';
import {
  dismissLaunchTicker,
  isLaunchTickerDismissed,
} from '@/lib/launchTicker';

export default function LaunchTicker() {
  const { t } = useTranslation();
  const { closed } = useFounderSlots();
  const [dismissed, setDismissed] = useState(isLaunchTickerDismissed);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const reduced = mq.matches;
      setReduceMotion(reduced);
      if (reduced) setPaused(true);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (dismissed || closed) return null;

  const text = t('landing.launchTicker');
  const moving = !reduceMotion && !paused;

  return (
    <div
      className="launch-ticker"
      role="region"
      aria-label={t('landing.launchTickerRegion')}
    >
      <p className="sr-only">{text}</p>
      <div className="launch-ticker-viewport">
        <div
          className="launch-ticker-track"
          data-paused={paused || reduceMotion ? 'true' : 'false'}
          aria-hidden="true"
        >
          <span className="launch-ticker-item">{text}</span>
          <span className="launch-ticker-item">{text}</span>
        </div>
      </div>
      <div className="launch-ticker-actions">
        {!reduceMotion && (
          <button
            type="button"
            className="launch-ticker-btn"
            aria-pressed={!moving}
            aria-label={
              paused
                ? t('landing.launchTickerPlay')
                : t('landing.launchTickerPause')
            }
            title={
              paused
                ? t('landing.launchTickerPlay')
                : t('landing.launchTickerPause')
            }
            onClick={() => setPaused((prev) => !prev)}
          >
            {paused ? (
              <Play className="w-3.5 h-3.5" fill="currentColor" aria-hidden />
            ) : (
              <Pause className="w-3.5 h-3.5" fill="currentColor" aria-hidden />
            )}
          </button>
        )}
        <button
          type="button"
          className="launch-ticker-btn"
          aria-label={t('common.closeAria')}
          title={t('common.closeAria')}
          onClick={() => {
            dismissLaunchTicker();
            setDismissed(true);
          }}
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
