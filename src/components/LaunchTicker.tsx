import { Pause, Play, X } from 'lucide-react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useFounderSlots } from '@/lib/useFounderSlots';
import {
  dismissLaunchTicker,
  isLaunchTickerDismissed,
} from '@/lib/launchTicker';

function TickerGroup({
  text,
  copies,
  groupRef,
  itemRef,
}: {
  text: string;
  copies: number;
  groupRef?: Ref<HTMLDivElement>;
  itemRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <div className="launch-ticker-group" ref={groupRef}>
      {Array.from({ length: copies }, (_, index) => (
        <span
          key={index}
          className="launch-ticker-item"
          ref={index === 0 ? itemRef : undefined}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

export default function LaunchTicker() {
  const { t } = useTranslation();
  const { closed } = useFounderSlots();
  const text = t('landing.launchTicker');
  const [dismissed, setDismissed] = useState(isLaunchTickerDismissed);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [copies, setCopies] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (dismissed || closed || reduceMotion) return;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const group = groupRef.current;
    const item = itemRef.current;
    if (!viewport || !track || !group || !item) return;

    const apply = () => {
      const itemWidth = item.getBoundingClientRect().width;
      const viewWidth = viewport.getBoundingClientRect().width;
      if (itemWidth <= 0 || viewWidth <= 0) return;
      const next = Math.max(1, Math.ceil(viewWidth / itemWidth));
      setCopies((prev) => (prev === next ? prev : next));
      const shift = group.offsetWidth;
      if (shift <= 0) return;
      const current = track.style.getPropertyValue('--ticker-shift');
      const nextShift = `${shift}px`;
      if (current !== nextShift) {
        track.style.setProperty('--ticker-shift', nextShift);
        track.style.animationDuration = `${Math.max(20, shift / 36)}s`;
      }
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(viewport);
    ro.observe(item);
    ro.observe(group);
    return () => ro.disconnect();
  }, [closed, copies, dismissed, reduceMotion, text]);

  if (dismissed || closed) return null;

  const moving = !reduceMotion && !paused;

  return (
    <div
      className="launch-ticker"
      role="region"
      aria-label={t('landing.launchTickerRegion')}
    >
      <p className="sr-only">{text}</p>
      <div className="launch-ticker-viewport" ref={viewportRef}>
        <div
          ref={trackRef}
          className="launch-ticker-track"
          data-paused={paused || reduceMotion ? 'true' : 'false'}
          aria-hidden="true"
        >
          <TickerGroup
            text={text}
            copies={copies}
            groupRef={groupRef}
            itemRef={itemRef}
          />
          {!reduceMotion && <TickerGroup text={text} copies={copies} />}
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
