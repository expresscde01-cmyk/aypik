import { useLayoutEffect, useRef, useState } from 'react';

const RISE = 6;
const DIP = 1;
const RADIUS = 14;
const KAPPA = 0.5522847498;

function profileSaveScoopPath(width: number, height: number) {
  const r = Math.min(RADIUS, width / 2 - 2, height / 2 - 1);
  const yLow = RISE + DIP;
  const mid = width / 2;
  const half = (mid - r) / 2;
  const k = KAPPA * r;
  const right = width - r;
  const bottom = height;
  const n = (value: number) => value.toFixed(2);
  return [
    `M ${n(r)} 0`,
    `C ${n(r + half)} 0 ${n(mid - half)} ${n(yLow)} ${n(mid)} ${n(yLow)}`,
    `C ${n(mid + half)} ${n(yLow)} ${n(right - half)} 0 ${n(right)} 0`,
    `C ${n(right + k)} 0 ${n(width)} ${n(r - k)} ${n(width)} ${n(r)}`,
    `L ${n(width)} ${n(bottom - r)}`,
    `C ${n(width)} ${n(bottom - r + k)} ${n(right + k)} ${n(bottom)} ${n(right)} ${n(bottom)}`,
    `L ${n(r)} ${n(bottom)}`,
    `C ${n(r - k)} ${n(bottom)} 0 ${n(bottom - r + k)} 0 ${n(bottom - r)}`,
    `L 0 ${n(r)}`,
    `C 0 ${n(r - k)} ${n(r - k)} 0 ${n(r)} 0`,
    'Z',
  ].join(' ');
}

export default function ProfileSaveScoopFace() {
  const faceRef = useRef<HTMLSpanElement>(null);
  const [path, setPath] = useState('');

  useLayoutEffect(() => {
    const face = faceRef.current;
    if (!face) return;
    const apply = () => {
      const width = face.offsetWidth;
      const height = face.offsetHeight;
      if (width < 32 || height < 24) return;
      const next = profileSaveScoopPath(width, height);
      setPath((prev) => (prev === next ? prev : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(face);
    return () => observer.disconnect();
  }, []);

  return (
    <span className="profile-save-scoop-shadow" aria-hidden="true">
      <span
        ref={faceRef}
        className="profile-save-scoop-face"
        style={path ? { clipPath: `path('${path}')` } : undefined}
      />
    </span>
  );
}
