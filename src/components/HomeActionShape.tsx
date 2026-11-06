import { useEffect, useId, useRef, useState } from 'react';

const AMPLITUDE = 4;
const CORNER = 14;

type Tone = 'discover' | 'matches';

function waveY(x: number, width: number, height: number, edge: 'top' | 'bottom') {
  const base = edge === 'top' ? AMPLITUDE : height - AMPLITUDE;
  return base + AMPLITUDE * Math.sin((3 * Math.PI * x) / width);
}

function samples(from: number, to: number, width: number) {
  const steps = Math.max(28, Math.round(width / 3));
  const points: number[] = [];
  for (let i = 0; i <= steps; i += 1) points.push(from + ((to - from) * i) / steps);
  return points;
}

function line(points: Array<[number, number]>) {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
}

function cubic(
  c1: [number, number],
  c2: [number, number],
  end: [number, number],
) {
  return `C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
}

/** Vague 1,5 période, mêmes bords haut et bas, coins latéraux arrondis. */
export function homeActionGeometry(width: number, height: number) {
  const radius = Math.min(CORNER, Math.max(0, (height - AMPLITUDE * 2) / 2 - 1));
  const handle = radius * 0.55;
  const slopeAt = (x: number) =>
    ((AMPLITUDE * 3 * Math.PI) / width) * Math.cos((3 * Math.PI * x) / width);
  const top = (x: number) => waveY(x, width, height, 'top');
  const bottom = (x: number) => waveY(x, width, height, 'bottom');
  const xL = radius;
  const xR = width - radius;
  const topL: [number, number] = [xL, top(xL)];
  const topR: [number, number] = [xR, top(xR)];
  const botR: [number, number] = [xR, bottom(xR)];
  const botL: [number, number] = [xL, bottom(xL)];
  const sideTop = top(0) + radius;
  const sideBot = bottom(0) - radius;
  const sL = slopeAt(xL);
  const sR = slopeAt(xR);
  const topPts = samples(xL, xR, width).map((x) => [x, top(x)] as [number, number]);
  const bottomPts = samples(xR, xL, width).map((x) => [x, bottom(x)] as [number, number]);

  const rightTop: [number, number] = [width, sideTop];
  const rightBot: [number, number] = [width, sideBot];
  const leftBot: [number, number] = [0, sideBot];
  const leftTop: [number, number] = [0, sideTop];

  const toRight = cubic(
    [topR[0] + handle, topR[1] + sR * handle],
    [width, sideTop - handle],
    rightTop,
  );
  const toBottom = cubic(
    [width, sideBot + handle],
    [botR[0] + handle, botR[1] + sR * handle],
    botR,
  );
  const toLeft = cubic(
    [botL[0] - handle, botL[1] - sL * handle],
    [0, sideBot + handle],
    leftBot,
  );
  const toTop = cubic(
    [0, sideTop - handle],
    [topL[0] - handle, topL[1] - sL * handle],
    topL,
  );

  const body = [
    `M ${topL[0].toFixed(2)} ${topL[1].toFixed(2)}`,
    ...topPts.slice(1).map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`),
    toRight,
    `L ${width.toFixed(2)} ${sideBot.toFixed(2)}`,
    toBottom,
    ...bottomPts.slice(1).map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`),
    toLeft,
    `L 0 ${sideTop.toFixed(2)}`,
    toTop,
    'Z',
  ].join(' ');

  return {
    body,
    top: line(topPts),
    bottom: line(bottomPts),
    sideLeft: `M 0.5 ${sideBot.toFixed(2)} L 0.5 ${sideTop.toFixed(2)}`,
    sideRight: `M ${(width - 0.5).toFixed(2)} ${sideTop.toFixed(2)} L ${(width - 0.5).toFixed(2)} ${sideBot.toFixed(2)}`,
  };
}

export default function HomeActionShape({ tone }: { tone: Tone }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const reactId = useId().replace(/:/g, '');
  const [size, setSize] = useState({ w: 0, h: 52 });

  useEffect(() => {
    const host = svgRef.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height) || 52;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const gradId = `home-wave-${tone}-${reactId}`;
  const clipId = `home-wave-clip-${tone}-${reactId}`;
  const geom = size.w > 0 ? homeActionGeometry(size.w, size.h) : null;

  return (
    <svg
      ref={svgRef}
      className="member-home-action-shape"
      viewBox={geom ? `0 0 ${size.w} ${size.h}` : '0 0 1 1'}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {geom && (
        <>
          <defs>
            <linearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={size.w}
              y2="0"
            >
              <stop offset="0%" stopColor="#b8125f" />
              <stop offset="35%" stopColor="#ce0e5e" />
              <stop offset="60%" stopColor="#de063c" />
              <stop offset="85%" stopColor="#ec3c0e" />
              <stop offset="100%" stopColor="#f26a0a" />
            </linearGradient>
            <clipPath id={clipId}>
              <path d={geom.body} />
            </clipPath>
          </defs>
          <path d={geom.body} fill={tone === 'discover' ? `url(#${gradId})` : '#ffffff'} />
          <g clipPath={`url(#${clipId})`}>
            <path
              d={geom.top}
              fill="none"
              stroke={tone === 'discover' ? '#ffffff' : `url(#${gradId})`}
              strokeOpacity={tone === 'discover' ? 0.95 : 1}
              strokeWidth="6"
              strokeLinecap="butt"
            />
            <path
              d={geom.bottom}
              fill="none"
              stroke={tone === 'discover' ? '#ffffff' : `url(#${gradId})`}
              strokeOpacity={tone === 'discover' ? 0.95 : 1}
              strokeWidth="6"
              strokeLinecap="butt"
            />
          </g>
          {tone === 'matches' && (
            <>
              <path d={geom.sideLeft} fill="none" stroke="#F1E3E6" strokeWidth="1" />
              <path d={geom.sideRight} fill="none" stroke="#F1E3E6" strokeWidth="1" />
            </>
          )}
        </>
      )}
    </svg>
  );
}
