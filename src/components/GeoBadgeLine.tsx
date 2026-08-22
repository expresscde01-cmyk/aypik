import {
  formatDistanceKmBadge,
  GEO_PERIMETER_FILTER_LABEL,
  isGeoMacroBadgeLabel,
  profileCardGeoBadge,
  type GeoPerimeterFilter,
  type GeoProximityFlags,
} from '@/lib/geoProximity';

/** Silhouette France métropolitaine + Corse, fill currentColor. */
export function FranceMapIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M10.85 2.2c.95-.42 2.12-.32 2.95.32 1.02-.28 2.18.28 2.48 1.32 1.42.22 2.52 1.48 2.32 2.95 1.42.68 1.92 2.38 1.22 3.72 1.22.92 1.28 2.62.28 3.72.58 1.42-.28 3.02-1.78 3.32-.18 1.48-1.52 2.62-3.02 2.48-.52 1.38-2.02 2.18-3.42 1.78-1.18 1.12-3.12.82-4.02-.58-1.62.38-3.18-.72-3.38-2.32-1.42-.28-2.48-1.62-2.28-3.08-1.32-.82-1.48-2.58-.38-3.68-.68-1.42.22-3.08 1.68-3.38.12-1.52 1.42-2.68 2.95-2.58.48-1.32 1.78-2.15 3.18-1.72Z" />
      <path d="M18.72 19.05c.22.62-.08 1.28-.68 1.58-.52.42-1.28.32-1.68-.22-.52.18-1.12-.18-1.22-.72-.52-.18-.78-.78-.48-1.28.38-.52 1.18-.58 1.68-.28.42-.42 1.08-.52 1.52-.18.48.12.78.58.86 1.1Z" />
    </svg>
  );
}

export function GeoBadgeLine({ label }: { label: string }) {
  const macro = isGeoMacroBadgeLabel(label);
  return (
    <p className="profile-card-geo-badge" style={{ color: '#047857' }}>
      {macro ? <FranceMapIcon className="w-3 h-3 shrink-0" /> : null}
      <span className="truncate">{label || '\u00a0'}</span>
    </p>
  );
}

/**
 * Architecture figée des fiches : toujours deux lignes empilées.
 * Jamais de return null, jamais une seule ligne, jamais de fusion.
 */
export function CardGeoFacts({
  flags,
  location,
  perimeter,
  distanceKm,
}: {
  flags?: Partial<GeoProximityFlags> | null;
  location?: string | null;
  perimeter?: GeoPerimeterFilter | null;
  distanceKm: number | null | undefined;
}) {
  const badge = profileCardGeoBadge(flags, location, perimeter) || '\u00a0';
  const isSameCity = badge === GEO_PERIMETER_FILTER_LABEL.city;
  const km = isSameCity ? '\u00a0' : formatDistanceKmBadge(distanceKm) || '\u00a0'; 
  return (
    <div className="profile-card-geo">
      <GeoBadgeLine label={badge} />
      <p className="profile-card-geo-km" style={{ color: '#10b981' }}>
        {km}
      </p>
    </div>
  );
}
