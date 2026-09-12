import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo, Fragment, type ButtonHTMLAttributes } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Heart,
  MapPin,
  MessageCircle,
  Sparkles,
  AlertCircle,
  Zap,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Map as MapIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/useMembership';
import { type Profile } from '@/components/ProfileSetup';
import { ProfileCardCornerBadges, PremiumBadge } from '@/components/membership/Badges';
import { CardGeoFacts, InternationalCardGeoFacts, FranceFlagIcon } from '@/components/GeoBadgeLine';
import {
  AdvancedFiltersTeaser,
  LikesQuotaHint,
} from '@/components/membership/PremiumTeasers';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { SITE_FREE_MODE, offerLabel } from '@/lib/founderCopy';
import { formatPremiumPriceLabel, isFounderPeriodActive } from '@/lib/membership';
import { flashErrorMessage, isFlashCtaVisible, sendFlash } from '@/lib/flashes';
import {
  geoPerimeterFilterLabel,
  GEO_PERIMETER_SCOPE_MENU,
  GEO_FRANCE_STRATA_MENU,
  isGeoPerimeterFilter,
  isGeoProximityStratum,
  geoExclusiveApplies,
  geoPerimeterScope,
  shouldHideViewedOnProximityShift,
  isInternationalPerimeter,
  isFranceHexagonePerimeter,
  isGeoFilterActive,
  isWideFrancePerimeter,
  type GeoPerimeterFilter,
} from '@/lib/geoProximity';
import {
  WORLD_ZONE_CONTINENTS,
  worldZoneDisplayLabel,
  FRANCE_WORLD_CHOICE_ALL,
  FRANCE_WORLD_CHOICE_OVERSEAS,
  FRANCE_WORLD_CHOICE_FRANCOPHONE,
  FRANCE_WORLD_CHOICE_LABEL,
  FRANCE_WORLD_COUNTRY_SECTIONS,
  INTERNATIONAL_COUNTRY_SECTIONS,
  formatInternationalGeoFacts,
  toggleWorldZoneSelection,
  toggleIsoSelection,
  worldZonesClosedLabel,
  franceWorldClosedLabel,
  franceWorldCountryLabel,
  franceWorldLabelMatches,
  compareFrenchCountryLabel,
  internationalCountryLabel,
  parseInternationalCountries,
  countryListClosedLabel,
  type FranceWorldChoice,
  type GeoCountryMenuSection,
  type WorldZone,
  type WorldZoneFilter,
} from '@/lib/worldGeo';
import {
  fetchDiscoveryCatalog,
  fetchPlatformSignupCount,
  type DiscoveryCandidate,
  type DiscoveryCatalogSortId,
} from '@/lib/discoveryCatalog';
import {
  newProfilesCutoffIso,
  newProfilesWindowMonths,
  sortDiscoveryCandidates,
  sortDiscoveryFilterResults,
} from '@/lib/discoverySort';
import { useSuggestionPrefs, syncDiscoverPrefs, flushDiscoverPrefs } from '@/lib/suggestionPrefs';
import ProfileDetailModal from '@/components/ProfileDetailModal';
import ChatScreen from '@/components/ChatScreen';
import ProfilePhoto from '@/components/ProfilePhoto';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { unreadMessagesLabel } from '@/components/UnreadBadge';
import { userErrorMessage } from '@/lib/userError';
import { isSimplifiedDiscoverMode } from '@/lib/discoverMode';
import { queryKeys, SIGNUP_COUNT_STALE_MS } from '@/lib/queryClient';
import {
  fetchLikeFlashEdges,
  invalidateLikeFlashEdges,
} from '@/lib/likeFlashEdges';
import { candidatePassesGeoFilter } from '@/lib/suggestionMatch';
import { LIKE_NOTIFICATION_EMOJI } from '@/lib/interactionCopy';
import PortaledActionTooltip from '@/components/PortaledActionTooltip';
import { useTranslation } from 'react-i18next';
import { t as tStatic } from '@/i18n/t';

const SORT_OPTIONS = [
  {
    id: 'nouveaux',
    labelKey: 'discover.sortNewProfiles',
    icon: '🕒',
  },
  {
    id: 'distance',
    labelKey: 'discover.sortDistance',
    icon: '📍',
  },
  {
    id: 'interests',
    labelKey: 'discover.interestsFilter',
    icon: 'palette',
  },
  {
    id: 'actifs',
    labelKey: 'discover.sortActive',
    icon: '💫',
  },
] as const;

type SortChoice = (typeof SORT_OPTIONS)[number]['id'];

function PerimeterMenuLabel({
  id,
  closed,
}: {
  id: GeoPerimeterFilter;
  closed?: boolean;
}) {
  const label = geoPerimeterFilterLabel(id);
  const row = `${closed ? 'inline-flex' : 'flex'} items-center gap-1.5 min-w-0`;
  const iconSlot =
    'inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center';
  if (id === 'anywhere') {
    return (
      <span className={`${row} leading-none`}>
        <span className="inline-flex w-3.5 h-4 shrink-0 items-center justify-center">
          <FranceFlagIcon className="w-3.5 h-4" />
        </span>
        <span className="truncate leading-none">{label}</span>
      </span>
    );
  }
  if (id === 'la_france_dans_le_monde') {
    return (
      <span className={row}>
        <span className={`${iconSlot} rounded-[3px] bg-[#e5e7eb]`}>
          <MapIcon
            className={`w-3.5 h-3.5${closed ? ' text-emerald-700' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </span>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  if (id === 'international') {
    return (
      <span className={row}>
        <span className={iconSlot}>
          <Globe
            className={`w-3.5 h-3.5${closed ? ' text-emerald-700' : ''}`}
            aria-hidden
          />
        </span>
        <span className="truncate">{label}</span>
        {!closed ? <PremiumBadge size="sm" /> : null}
      </span>
    );
  }
  return <>{label}</>;
}

/** Défaut des seconds menus : PARTOUT (globe), pas le libellé du premier menu. */
function PartoutMenuLabel({ closed }: { closed?: boolean }) {
  return (
    <span className={`${closed ? 'inline-flex' : 'flex'} items-center gap-1.5 min-w-0`}>
      <Globe
        className={`w-3.5 h-3.5 shrink-0${closed ? ' text-emerald-700' : ''}`}
        aria-hidden
      />
      <span className="truncate">{worldZoneDisplayLabel('worldwide')}</span>
    </span>
  );
}

/** Défaut du second menu FRANCE : PARTOUT (globe), pas le libellé FRANCE du premier menu. */
function FranceStrataMenuLabel({
  id,
  closed,
}: {
  id: GeoPerimeterFilter;
  closed?: boolean;
}) {
  if (id === 'anywhere') {
    return <PartoutMenuLabel closed={closed} />;
  }
  return <PerimeterMenuLabel id={id} closed={closed} />;
}

function geoCountryOptionClass(selected: boolean) {
  return `w-full text-left px-3 py-1.5 text-sm transition-colors ${
    selected
      ? 'bg-emerald-50 text-emerald-950 font-semibold hover:bg-emerald-100 hover:text-emerald-950'
      : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-950'
  }`;
}

function PreciseCountryPanel({
  sections,
  selectedIsos,
  query,
  onQueryChange,
  onBack,
  onPick,
}: {
  sections: readonly GeoCountryMenuSection[];
  selectedIsos: readonly string[];
  query: string;
  onQueryChange: (next: string) => void;
  onBack: () => void;
  onPick: (iso2: string) => void;
}) {
  const visible = sections
    .map((section) => ({
      title: section.title,
      rows: section.rows
        .filter((row) => franceWorldLabelMatches(row.label, query))
        .slice()
        .sort((a, b) => compareFrenchCountryLabel(a.label, b.label)),
    }))
    .filter((section) => section.rows.length > 0);

  return (
    <>
      <li>
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-950 flex items-center gap-1.5"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden />
          {tStatic('discover.specificCountry')}
        </button>
      </li>
      <li className="px-2 pb-1.5 pt-0.5">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onMouseDown={(event) => event.stopPropagation()}
          placeholder={tStatic('discover.searchCountry')}
          aria-label={tStatic('discover.searchCountry')}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-emerald-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </li>
      {visible.map((section, index) => (
        <Fragment key={section.title}>
          {index > 0 ? (
            <li
              role="separator"
              aria-hidden
              className="px-2.5 py-1.5 pointer-events-none"
            >
              <span className="block border-t border-gray-200" />
            </li>
          ) : null}
          <li
            className="geo-perimeter-section-label text-xs font-semibold text-rose-700"
            aria-hidden
          >
            {section.title}
          </li>
          {section.rows.map((row) => {
            const selected = selectedIsos.includes(row.iso2);
            return (
              <li key={row.iso2} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={geoCountryOptionClass(selected)}
                  onClick={() => onPick(row.iso2)}
                >
                  {row.label}
                </button>
              </li>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

function WorldZoneSelect({
  value,
  countries,
  disabled,
  onChange,
}: {
  value: WorldZone[];
  countries: string[];
  disabled: boolean;
  onChange: (next: {
    worldZones: WorldZone[];
    internationalCountries: string[];
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [countryLevel, setCountryLevel] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const preciseIsos = parseInternationalCountries(countries);
  const worldwide = preciseIsos.length === 0 && value.length === 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (countryLevel) {
          setCountryLevel(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, countryLevel]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setCountryLevel(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open || !countryLevel) setCountryQuery('');
  }, [open, countryLevel]);

  const pick = (clicked: WorldZoneFilter) => {
    onChange({
      worldZones: toggleWorldZoneSelection(
        preciseIsos.length > 0 ? [] : value,
        clicked
      ),
      internationalCountries: [],
    });
    setCountryLevel(false);
    if (clicked === 'worldwide') setOpen(false);
  };

  const pickCountry = (iso2: string) => {
    onChange({
      worldZones: [],
      internationalCountries: toggleIsoSelection(preciseIsos, iso2),
    });
  };

  const optionClass = (selected: boolean, emphasis = false) =>
    `w-full text-left px-3 py-1.5 text-sm transition-colors ${
      selected
        ? 'bg-emerald-50 text-emerald-950 font-semibold hover:bg-emerald-100 hover:text-emerald-950'
        : emphasis
          ? 'text-gray-700 font-medium hover:bg-emerald-50 hover:text-emerald-950'
          : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-950'
    }`;

  return (
    <div ref={rootRef} className="relative overflow-visible">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="geo-perimeter-closed rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-left text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:pointer-events-none disabled:cursor-not-allowed"
        onClick={() => {
          if (disabled) return;
          setOpen((visible) => {
            if (!visible) setCountryLevel(preciseIsos.length > 0);
            return !visible;
          });
        }}
      >
        <span className="geo-perimeter-closed-text">
          <span
            className={`geo-perimeter-closed-label${
              worldwide ? ' font-medium' : ''
            }`}
          >
            {preciseIsos.length > 0
              ? countryListClosedLabel(preciseIsos, internationalCountryLabel)
              : worldZonesClosedLabel(value)}
          </span>
        </span>
        <ChevronDown
          className={`geo-perimeter-closed-chevron w-4 h-4 text-emerald-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-multiselectable
          aria-label={
            countryLevel
              ? tStatic('discover.specificCountry')
              : tStatic('discover.geoPerimeter')
          }
          className={`geo-perimeter-menu mt-1 w-full rounded-xl border border-gray-200 bg-white py-1 pb-1.5 shadow-sm${
            countryLevel ? ' geo-perimeter-menu--page' : ' absolute z-40'
          }`}
        >
          {countryLevel ? (
            <PreciseCountryPanel
              sections={INTERNATIONAL_COUNTRY_SECTIONS}
              selectedIsos={preciseIsos}
              query={countryQuery}
              onQueryChange={setCountryQuery}
              onBack={() => setCountryLevel(false)}
              onPick={pickCountry}
            />
          ) : (
            <>
              {WORLD_ZONE_CONTINENTS.map((zone) => {
                const selected = preciseIsos.length === 0 && value.includes(zone);
                return (
                  <li key={zone} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={optionClass(selected)}
                      onClick={() => pick(zone)}
                    >
                      {worldZoneDisplayLabel(zone)}
                    </button>
                  </li>
                );
              })}
              <li
                role="separator"
                aria-hidden
                className="px-2.5 py-1.5 pointer-events-none"
              >
                <span className="block border-t border-gray-200" />
              </li>
              <li role="option" aria-selected={worldwide}>
                <button
                  type="button"
                  className={optionClass(worldwide, true)}
                  onClick={() => pick('worldwide')}
                >
                  {worldZoneDisplayLabel('worldwide')}
                </button>
              </li>
              <li role="option" aria-selected={preciseIsos.length > 0}>
                <button
                  type="button"
                  className={`${optionClass(preciseIsos.length > 0, true)} flex items-center justify-between gap-2`}
                  onClick={() => setCountryLevel(true)}
                >
                  <span>{tStatic('discover.specificCountry')}</span>
                  <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function FranceWorldSelect({
  value,
  codes,
  disabled,
  onChange,
}: {
  value: FranceWorldChoice;
  codes: string[];
  disabled: boolean;
  onChange: (next: { choice: FranceWorldChoice; codes: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [countryLevel, setCountryLevel] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const preciseIsos = codes.filter((iso) =>
    FRANCE_WORLD_COUNTRY_SECTIONS.some((section) =>
      section.rows.some((row) => row.iso2 === iso)
    )
  );
  const isCountry = preciseIsos.length > 0;
  const isDefault = !isCountry && value === FRANCE_WORLD_CHOICE_ALL;
  const isGroupEmphasis =
    !isCountry &&
    (isDefault ||
      value === FRANCE_WORLD_CHOICE_OVERSEAS ||
      value === FRANCE_WORLD_CHOICE_FRANCOPHONE);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (countryLevel) {
          setCountryLevel(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, countryLevel]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setCountryLevel(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open || !countryLevel) setCountryQuery('');
  }, [open, countryLevel]);

  const pickGroup = (next: FranceWorldChoice) => {
    onChange({ choice: next, codes: [] });
    setCountryLevel(false);
    setOpen(false);
  };

  const pickCountry = (iso2: string) => {
    onChange({
      choice: FRANCE_WORLD_CHOICE_ALL,
      codes: toggleIsoSelection(preciseIsos, iso2),
    });
  };

  const optionClass = (selected: boolean, emphasis = false) =>
    `w-full text-left px-3 py-1.5 text-sm transition-colors ${
      selected
        ? 'bg-emerald-50 text-emerald-950 font-semibold hover:bg-emerald-100 hover:text-emerald-950'
        : emphasis
          ? 'text-gray-700 font-medium hover:bg-emerald-50 hover:text-emerald-950'
          : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-950'
    }`;

  return (
    <div ref={rootRef} className="relative overflow-visible">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="geo-perimeter-closed rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-left text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:pointer-events-none disabled:cursor-not-allowed"
        onClick={() => {
          if (disabled) return;
          setOpen((visible) => {
            if (!visible) setCountryLevel(isCountry);
            return !visible;
          });
        }}
      >
        <span className="geo-perimeter-closed-text">
          <span
            className={`geo-perimeter-closed-label${
              isGroupEmphasis ? ' font-medium' : ''
            }`}
          >
            {isCountry ? (
              countryListClosedLabel(preciseIsos, franceWorldCountryLabel)
            ) : isDefault ? (
              <PartoutMenuLabel closed />
            ) : (
              franceWorldClosedLabel(value)
            )}
          </span>
        </span>
        <ChevronDown
          className={`geo-perimeter-closed-chevron w-4 h-4 text-emerald-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-multiselectable={countryLevel}
          aria-label={
            countryLevel
              ? tStatic('discover.specificCountry')
              : tStatic('discover.francophoneTerritories')
          }
          className="geo-perimeter-menu geo-perimeter-menu--page mt-1 w-full rounded-xl border border-gray-200 bg-white py-1 pb-1.5 shadow-sm"
        >
          {countryLevel ? (
            <PreciseCountryPanel
              sections={FRANCE_WORLD_COUNTRY_SECTIONS}
              selectedIsos={preciseIsos}
              query={countryQuery}
              onQueryChange={setCountryQuery}
              onBack={() => setCountryLevel(false)}
              onPick={pickCountry}
            />
          ) : (
            <>
              <li role="option" aria-selected={isDefault}>
                <button
                  type="button"
                  className={optionClass(isDefault, true)}
                  onClick={() => pickGroup(FRANCE_WORLD_CHOICE_ALL)}
                >
                  <PartoutMenuLabel />
                </button>
              </li>
              <li
                role="option"
                aria-selected={value === FRANCE_WORLD_CHOICE_OVERSEAS}
              >
                <button
                  type="button"
                  className={optionClass(
                    value === FRANCE_WORLD_CHOICE_OVERSEAS,
                    true
                  )}
                  onClick={() => pickGroup(FRANCE_WORLD_CHOICE_OVERSEAS)}
                >
                  {FRANCE_WORLD_CHOICE_LABEL.overseas}
                </button>
              </li>
              <li
                role="option"
                aria-selected={value === FRANCE_WORLD_CHOICE_FRANCOPHONE}
              >
                <button
                  type="button"
                  className={optionClass(
                    value === FRANCE_WORLD_CHOICE_FRANCOPHONE,
                    true
                  )}
                  onClick={() => pickGroup(FRANCE_WORLD_CHOICE_FRANCOPHONE)}
                >
                  {FRANCE_WORLD_CHOICE_LABEL.francophone}
                </button>
              </li>
              <li role="option" aria-selected={isCountry}>
                <button
                  type="button"
                  className={`${optionClass(isCountry, true)} flex items-center justify-between gap-2`}
                  onClick={() => setCountryLevel(true)}
                >
                  <span>{tStatic('discover.specificCountry')}</span>
                  <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}

/** Palette jaune + taches franches, sans teinte rose du bouton. */
function PaletteSortIcon() {
  return (
    <svg
      viewBox="2.2 2 14.2 12.4"
      width="1em"
      height="1em"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#E8C36A"
        d="M10.2 2.2c-4.3 0-7.8 3.2-7.8 7.6 0 2.6 1.4 4.4 3.3 4.4 1.1 0 1.6-.6 2.2-1.4.4-.6.9-1.3 1.8-1.3h.6c3.2 0 5.8-2.4 5.8-5.4 0-2.3-2.5-3.9-5.9-3.9Z"
      />
      <circle cx="7.1" cy="6.6" r="1.25" fill="#E53935" />
      <circle cx="10.4" cy="5.5" r="1.2" fill="#FB8C00" />
      <circle cx="13.4" cy="7" r="1.2" fill="#FDD835" />
      <circle cx="8.1" cy="10.4" r="1.2" fill="#43A047" />
      <circle cx="11.6" cy="10.1" r="1.15" fill="#1E88E5" />
      <circle cx="14.2" cy="9.4" r="1.05" fill="#5C6BC0" />
    </svg>
  );
}

function GeoPerimeterSelect({
  value,
  disabled,
  onChange,
}: {
  value: GeoPerimeterFilter;
  disabled: boolean;
  onChange: (next: GeoPerimeterFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scope = geoPerimeterScope(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative overflow-visible">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="geo-perimeter-closed rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-left text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:pointer-events-none disabled:cursor-not-allowed"
        onClick={() => {
          if (disabled) return;
          setOpen((visible) => !visible);
        }}
      >
        <span className="geo-perimeter-closed-text">
          <span className="geo-perimeter-closed-label font-medium">
            <PerimeterMenuLabel id={scope} closed />
          </span>
        </span>
        <ChevronDown
          className={`geo-perimeter-closed-chevron w-4 h-4 text-emerald-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={tStatic('discover.geoPerimeter')}
          className="geo-perimeter-menu absolute z-40 mt-1 w-full rounded-xl border border-gray-200 bg-white py-1 pb-1.5 shadow-sm"
        >
          {GEO_PERIMETER_SCOPE_MENU.map((item, index) => {
            if (item.type === 'divider') {
              return (
                <li
                  key={`divider-${item.style}-${index}`}
                  role="separator"
                  aria-hidden
                  className="px-2.5 py-1.5 pointer-events-none"
                >
                  <span
                    className={
                      item.style === 'solid'
                        ? 'block border-t border-gray-200'
                        : 'block border-t-[3px] border-double border-gray-200'
                    }
                  />
                </li>
              );
            }
            const selected = item.id === scope;
            return (
              <li key={item.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-emerald-50 text-emerald-950 font-semibold hover:bg-emerald-100 hover:text-emerald-950'
                      : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-950'
                  }`}
                  onClick={() => {
                    if (item.id === 'anywhere') {
                      if (!isFranceHexagonePerimeter(value)) {
                        onChange('anywhere');
                      }
                    } else {
                      onChange(item.id);
                    }
                    setOpen(false);
                  }}
                >
                  <PerimeterMenuLabel id={item.id} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FranceStrataSelect({
  value,
  exclusive,
  disabled,
  onChange,
  onExclusiveChange,
}: {
  value: GeoPerimeterFilter;
  exclusive: boolean;
  disabled: boolean;
  onChange: (next: GeoPerimeterFilter) => void;
  onExclusiveChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const exclusiveApplies = geoExclusiveApplies(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative overflow-visible">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="geo-perimeter-closed rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-left text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:pointer-events-none disabled:cursor-not-allowed"
        onClick={() => {
          if (disabled) return;
          setOpen((visible) => !visible);
        }}
      >
        <span className="geo-perimeter-closed-text">
          <span
            className={`geo-perimeter-closed-label${
              isWideFrancePerimeter(value) ? ' font-medium' : ''
            }`}
          >
            <FranceStrataMenuLabel id={value} closed />
          </span>
          {exclusiveApplies && exclusive ? (
            <span className="geo-perimeter-closed-exclusive">
              {tStatic('discover.exclusiveClosed')}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`geo-perimeter-closed-chevron w-4 h-4 text-emerald-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={tStatic('discover.geoPerimeterFrance')}
          className="geo-perimeter-menu geo-perimeter-menu--page mt-1 w-full rounded-xl border border-gray-200 bg-white py-1 pb-1.5 shadow-sm"
        >
          <li className="px-2 pt-0.5 pb-1">
            <button
              type="button"
              role="switch"
              aria-checked={exclusiveApplies && exclusive}
              aria-disabled={!exclusiveApplies}
              aria-label={tStatic('discover.exclusive')}
              title={
                exclusiveApplies
                  ? tStatic('discover.exclusiveOnlyThis')
                  : tStatic('discover.exclusiveHint')
              }
              className={`geo-exclusive-toggle${
                exclusiveApplies && exclusive
                  ? ' geo-exclusive-toggle--on'
                  : ''
              }${exclusiveApplies ? '' : ' geo-exclusive-toggle--idle'}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!exclusiveApplies) {
                  setOpen(false);
                  return;
                }
                onExclusiveChange(!exclusive);
                setOpen(false);
              }}
            >
              <span className="geo-exclusive-toggle-text">Exclusivement</span>
              <span className="geo-exclusive-toggle-track" aria-hidden>
                <span className="geo-exclusive-toggle-thumb" />
              </span>
            </button>
          </li>
          {GEO_FRANCE_STRATA_MENU.map((item, index) => {
            if (item.type === 'divider') {
              return (
                <li
                  key={`divider-${item.style}-${index}`}
                  role="separator"
                  aria-hidden
                  className="px-2.5 py-1.5 pointer-events-none"
                >
                  <span
                    className={
                      item.style === 'solid'
                        ? 'block border-t border-gray-200'
                        : 'block border-t-[3px] border-double border-gray-200'
                    }
                  />
                </li>
              );
            }
            const selected = item.id === value;
            const isEmphasis = isWideFrancePerimeter(item.id);
            return (
              <li key={item.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    selected
                      ? 'bg-emerald-50 text-emerald-950 font-semibold hover:bg-emerald-100 hover:text-emerald-950'
                      : isEmphasis
                        ? 'text-gray-700 font-medium hover:bg-emerald-50 hover:text-emerald-950'
                        : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-950'
                  }`}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <FranceStrataMenuLabel id={item.id} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type InterestOverlapValue = 0 | 1 | 2 | 3;

function interestOverlapLabel(value: InterestOverlapValue): string {
  if (value === 0) return tStatic('discover.interestsIndifferent');
  if (value === 1) return tStatic('discover.interestsAtLeast1');
  if (value === 2) return tStatic('discover.interestsAtLeast2');
  return tStatic('discover.interestsAtLeast3');
}

const INTEREST_OVERLAP_MENU: readonly (
  | { type: 'option'; value: InterestOverlapValue }
  | { type: 'divider' }
)[] = [
  { type: 'option', value: 1 },
  { type: 'option', value: 2 },
  { type: 'option', value: 3 },
  { type: 'divider' },
  { type: 'option', value: 0 },
];

function isInterestOverlapValue(value: number): value is InterestOverlapValue {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function InterestOverlapSelect({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (next: InterestOverlapValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current: InterestOverlapValue = isInterestOverlapValue(value)
    ? value
    : 1;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:pointer-events-none disabled:cursor-not-allowed"
        onClick={() => {
          if (disabled) return;
          setOpen((visible) => !visible);
        }}
      >
        <span
          className={`truncate text-emerald-950${current === 0 ? ' font-medium' : ''}`}
        >
          {interestOverlapLabel(current)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-emerald-600 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={tStatic('discover.interestsInCommon')}
          className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white py-1 shadow-sm overflow-hidden"
        >
          {INTEREST_OVERLAP_MENU.map((item, index) => {
            if (item.type === 'divider') {
              return (
                <li
                  key={`divider-${index}`}
                  role="separator"
                  aria-hidden
                  className="px-2.5 py-1.5 pointer-events-none"
                >
                  <span className="block border-t-[3px] border-double border-gray-200" />
                </li>
              );
            }
            const selected = item.value === current;
            const isGlobal = item.value === 0;
            return (
              <li
                key={item.value}
                role="option"
                aria-selected={selected}
              >
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    selected
                      ? 'bg-emerald-50 text-emerald-950 font-semibold hover:bg-emerald-100 hover:text-emerald-950'
                      : isGlobal
                        ? 'text-gray-700 font-medium hover:bg-emerald-50 hover:text-emerald-950'
                        : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-950'
                  }`}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  {interestOverlapLabel(item.value)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Candidate = DiscoveryCandidate;

export default function DiscoveryPage({
  unreadBySender = {},
  onOpenUnreadChat,
  profileEpoch = 0,
  pageActive = true,
  myProfile = null,
}: {
  unreadBySender?: Record<string, number>;
  onOpenUnreadChat?: (actorId: string) => void;
  /** Incrémenté après une MAJ profil / à chaque visite Découvrir : force un reload DB. */
  profileEpoch?: number;
  /** False dès qu’on quitte Découvrir : la mémoire de session se réinitialise. */
  pageActive?: boolean;
  /** Profil déjà chargé par AppShell (PROFILE_CARD_COLUMNS). */
  myProfile?: Profile | null;
} = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const { status, refresh, loading: membershipLoading } = useMembership();
  const [actingId, setActingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showFiltersHint, setShowFiltersHint] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [prefs, setPrefs] = useSuggestionPrefs(userId, {
    listen: true,
    persistOnChange: false,
  });
  const { geoPerimeter, geoRadiusKm, geoExclusive, minOverlap, worldZones, internationalCountries, franceWorldChoice, franceWorldCodes } =
    prefs;
  const [sortEnabled, setSortEnabled] = useState(false);
  const [sortChoice, setSortChoice] = useState<SortChoice>('nouveaux');
  const filtersActive = !sortEnabled;
  const [openProfile, setOpenProfile] = useState<Candidate | null>(null);
  const [chatPeer, setChatPeer] = useState<Candidate | null>(null);
  const canFilter = status.can_use_advanced_filters;
  const geoFilterActive = isGeoFilterActive(geoPerimeter);
  const hasActiveFilter = geoFilterActive || minOverlap > 0;
  /**
   * Masqués tout de suite dans la grille (like / flash / masquer).
   * Conservés pour les fetches suivants de la visite.
   */
  const [sessionHiddenIds, setSessionHiddenIds] = useState(
    () => new Set<string>()
  );
  /**
   * Consultés (fiche ouverte) : restent visibles sur la strate en cours,
   * exclus des autres strates Même… en mode cumulatif, le temps de la visite.
   */
  const sessionViewedIdsRef = useRef<Set<string>>(new Set());
  const sessionViewedOnPerimeterRef = useRef<Map<string, GeoPerimeterFilter>>(
    new Map()
  );
  const sessionHiddenIdsRef = useRef(sessionHiddenIds);
  sessionHiddenIdsRef.current = sessionHiddenIds;
  const lastProximityPerimeterRef = useRef<GeoPerimeterFilter | null>(null);
  const geoPerimeterRef = useRef(geoPerimeter);
  geoPerimeterRef.current = geoPerimeter;
  const leftDiscoverRef = useRef(false);
  const [visitEpoch, setVisitEpoch] = useState(0);

  const hideFromCurrentFilter = useCallback((id: string) => {
    if (!id) return;
    sessionViewedIdsRef.current.add(id);
    sessionViewedOnPerimeterRef.current.set(id, geoPerimeterRef.current);
    setSessionHiddenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markViewedForLaterFilters = useCallback((id: string) => {
    if (!id) return;
    sessionViewedIdsRef.current.add(id);
    if (!sessionViewedOnPerimeterRef.current.has(id)) {
      sessionViewedOnPerimeterRef.current.set(id, geoPerimeterRef.current);
    }
  }, []);

  const clearDiscoverSession = useCallback(() => {
    sessionViewedIdsRef.current = new Set();
    sessionViewedOnPerimeterRef.current = new Map();
    lastProximityPerimeterRef.current = null;
    setSessionHiddenIds(new Set());
    setOpenProfile(null);
    setChatPeer(null);
  }, []);

  useEffect(() => {
    if (!pageActive) {
      leftDiscoverRef.current = true;
      clearDiscoverSession();
      return;
    }
    if (leftDiscoverRef.current) {
      leftDiscoverRef.current = false;
      clearDiscoverSession();
      setVisitEpoch((n) => n + 1);
    }
  }, [pageActive, clearDiscoverSession]);

  if (userId) syncDiscoverPrefs(userId, prefs);

  useLayoutEffect(() => {
    if (!userId) return;
    const flush = () => {
      flushDiscoverPrefs(userId);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [userId]);

  const edgesQuery = useQuery({
    queryKey: queryKeys.likeFlashEdges(userId || ''),
    enabled: Boolean(userId),
    queryFn: () => fetchLikeFlashEdges(userId!),
  });

  useEffect(() => {
    if (!edgesQuery.data) return;
    setLikedIds(new Set(edgesQuery.data.sentLikes.map((l) => l.to_user)));
    setFlashedIds(new Set(edgesQuery.data.sentFlashes.map((f) => f.to_user)));
  }, [edgesQuery.data]);

  const { data: signupCount = 0 } = useQuery({
    queryKey: queryKeys.signupCount(),
    queryFn: fetchPlatformSignupCount,
    staleTime: SIGNUP_COUNT_STALE_MS,
    enabled: Boolean(userId),
  });

  const catalogPrefs = useMemo(() => {
    const base = sortEnabled
      ? { ...prefs, geoPerimeter: 'anywhere' as const, minOverlap: 0 }
      : prefs;
    if (!geoExclusiveApplies(base.geoPerimeter)) {
      return { ...base, geoExclusive: false };
    }
    return base;
  }, [sortEnabled, prefs]);
  const prefsKey = `${catalogPrefs.geoPerimeter}|${catalogPrefs.franceWorldChoice}|${(catalogPrefs.franceWorldCodes || []).join(',')}|${(catalogPrefs.internationalCountries || []).join(',')}|${(catalogPrefs.worldZones || []).join(',')}|${catalogPrefs.geoExclusive ? 'x' : 'c'}|${catalogPrefs.geoRadiusKm}|${catalogPrefs.minOverlap}`;
  const newMonths = newProfilesWindowMonths(signupCount);
  const catalogSort: DiscoveryCatalogSortId = sortEnabled
    ? sortChoice
    : 'score';
  const cutoffIso = useMemo(
    () =>
      sortEnabled && sortChoice === 'nouveaux'
        ? newProfilesCutoffIso(newMonths)
        : null,
    [sortEnabled, sortChoice, newMonths]
  );

  const catalogQuery = useQuery({
    queryKey: queryKeys.discoveryCatalog(
      userId,
      prefsKey,
      catalogSort,
      cutoffIso,
      profileEpoch,
      visitEpoch
    ),
    enabled: Boolean(userId && myProfile),
    queryFn: ({ signal }) => {
      const excludeIds = Array.from(sessionHiddenIdsRef.current);
      const nextPerimeter = catalogPrefs.geoPerimeter;
      const nextExclusive = Boolean(catalogPrefs.geoExclusive);
      const prevPerimeter = lastProximityPerimeterRef.current;
      if (
        prevPerimeter &&
        shouldHideViewedOnProximityShift(
          prevPerimeter,
          nextPerimeter,
          nextExclusive
        )
      ) {
        sessionViewedIdsRef.current.forEach((id) => excludeIds.push(id));
      }
      if (isGeoProximityStratum(nextPerimeter)) {
        lastProximityPerimeterRef.current = nextPerimeter;
      }
      return fetchDiscoveryCatalog({
        userId: userId!,
        myProfile: myProfile!,
        prefs: catalogPrefs,
        sort: catalogSort,
        createdAfter: cutoffIso,
        excludeIds,
        signal,
      });
    },
  });

  const catalog = catalogQuery.data ?? [];
  const candidates = useMemo(
    () =>
      catalog.filter((c) => {
        if (sessionHiddenIds.has(c.id)) return false;
        if (!candidatePassesGeoFilter(c, catalogPrefs, myProfile?.location))
          return false;
        const viewedOn = sessionViewedOnPerimeterRef.current.get(c.id);
        if (
          viewedOn &&
          shouldHideViewedOnProximityShift(
            viewedOn,
            geoPerimeter,
            geoExclusive
          )
        ) {
          return false;
        }
        return true;
      }),
    [
      catalog,
      sessionHiddenIds,
      catalogPrefs,
      geoPerimeter,
      geoExclusive,
      myProfile?.location,
    ]
  );
  const loading = edgesQuery.isLoading;
  const searching = catalogQuery.isLoading;
  const catalogError = catalogQuery.error
    ? userErrorMessage(catalogQuery.error, t('discover.loadProfilesError'))
    : null;
  const displayError = error || catalogError;

  const founderActive = isFounderPeriodActive(status);
  const likesUnlimited = status.unlimited_likes || founderActive;
  const likesExhausted =
    !likesUnlimited && (status.likes_remaining_today ?? 0) <= 0;
  const showFlashCta = isFlashCtaVisible(status);
  const priceLabel = SITE_FREE_MODE
    ? undefined
    : formatPremiumPriceLabel(
        status.premium_price_cents,
        status.premium_currency,
        status.premium_interval
      );

  const sortHints: Record<SortChoice, string> = {
    nouveaux: t('discover.sortHintNew'),
    distance: t('discover.sortHintDistance'),
    interests: t('discover.sortHintInterests'),
    actifs: t('discover.sortHintActive'),
  };

  const displayed = useMemo(
    () =>
      sortEnabled
        ? sortDiscoveryCandidates(candidates, sortChoice, newMonths)
        : sortDiscoveryFilterResults(candidates),
    [candidates, sortChoice, newMonths, sortEnabled]
  );

  const countLabel = t('discover.profilesCount', { count: displayed.length });

  useEffect(() => {
    if (!openProfile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenProfile(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openProfile]);

  const handleLike = useCallback(
    async (candidate: Candidate) => {
      if (!user || actingId || likesExhausted || likedIds.has(candidate.id))
        return;

      setActingId(candidate.id);
      setError(null);

      try {
        const { error: likeErr } = await supabase.from('likes').insert({
          from_user: user.id,
          to_user: candidate.id,
        });
        if (likeErr) throw likeErr;
        hideFromCurrentFilter(candidate.id);
        setLikedIds((prev) => new Set(prev).add(candidate.id));
        setOpenProfile((open) => (open?.id === candidate.id ? null : open));

        const { data: reverse } = await supabase
          .from('likes')
          .select('id')
          .eq('from_user', candidate.id)
          .eq('to_user', user.id)
          .maybeSingle();

        if (reverse) {
          setToast(t('discover.matchToast', { name: candidate.display_name }));
          window.setTimeout(() => setToast(null), 2800);
        }

        invalidateLikeFlashEdges(user.id);
        await refresh();
      } catch (err) {
        setError(userErrorMessage(err, t('common.errorOccurred')));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, likesExhausted, likedIds, refresh, hideFromCurrentFilter]
  );

  const handleSkip = useCallback(
    (id: string) => {
      hideFromCurrentFilter(id);
      setOpenProfile((open) => (open?.id === id ? null : open));
      if (user) {
        // Persisté en base (discovery_passes) : le profil réapparaîtra
        // dans les suggestions après 2 mois. Best-effort, ne bloque pas l'UI.
        void supabase
          .from('discovery_passes')
          .upsert(
            { from_user: user.id, to_user: id },
            { onConflict: 'from_user,to_user' }
          );
      }
    },
    [hideFromCurrentFilter, user]
  );

  const openCandidate = useCallback(
    (candidate: Candidate) => {
      markViewedForLaterFilters(candidate.id);
      setOpenProfile(candidate);
    },
    [markViewedForLaterFilters]
  );

  const openUnread = useCallback(
    (candidate: Candidate) => {
      if (onOpenUnreadChat) onOpenUnreadChat(candidate.id);
      else openCandidate(candidate);
    },
    [onOpenUnreadChat, openCandidate]
  );

  const openDialogue = useCallback((candidate: Candidate) => {
    setOpenProfile(null);
    setChatPeer(candidate);
  }, []);

  const handleFlash = useCallback(
    async (candidate: Candidate) => {
      if (!user || actingId || flashedIds.has(candidate.id) || !showFlashCta)
        return;

      setActingId(candidate.id);
      setError(null);

      try {
        const result = await sendFlash(candidate.id);

        if (!result.ok) {
          setError(flashErrorMessage(result.error, status));
          return;
        }

        setFlashedIds((prev) => new Set(prev).add(candidate.id));
        hideFromCurrentFilter(candidate.id);
        setToast(
          result.already_flashed
            ? t('discover.alreadyFlashed')
            : result.matched
              ? t('discover.matchToast', { name: candidate.display_name })
              : t('discover.flashSent', { name: candidate.display_name })
        );

        window.setTimeout(() => setToast(null), 2800);
        invalidateLikeFlashEdges(user.id);
      } catch {
        setError(t('discover.flashFail'));
      } finally {
        setActingId(null);
      }
    },
    [user, actingId, flashedIds, status, showFlashCta, hideFromCurrentFilter]
  );

  const handleSortToggle = useCallback(() => {
    if (sortEnabled) {
      setSortEnabled(false);
      return;
    }
    setSortEnabled(true);
    setShowFilters(false);
  }, [sortEnabled]);

  const handleFiltersToggle = useCallback(() => {
    if (sortEnabled) return;
    setSortEnabled(false);
    setShowFilters((open) => !open);
  }, [sortEnabled]);

  if (loading || membershipLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
          <div className="text-gray-400 text-sm">Chargement...</div>
        </div>
      </div>
    );
  }

  if (displayError && !myProfile) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm max-w-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {status.can_use_advanced_filters ? (
        <div
          className={`space-y-2${sortEnabled ? ' discovery-filters--off' : ''}`}
          onClickCapture={(event) => {
            if (!sortEnabled) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDownCapture={(event) => {
            if (!sortEnabled) return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <AdvancedFiltersTeaser
            locked={false}
            expanded={filtersActive && showFilters}
            inactive={sortEnabled}
            onToggle={handleFiltersToggle}
            activeCount={
              filtersActive
                ? [geoFilterActive, minOverlap > 0].filter(Boolean).length
                : 0
            }
            priceLabel={priceLabel}
            status={status}
          />
          {filtersActive && showFilters && (
            <div
              id="discovery-filters-panel"
              className="rounded-2xl border border-rose-100 bg-white px-3 py-3 space-y-2.5 overflow-visible"
            >
              <p className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {t('discover.targetedSuggestions')}
              </p>
              <div className="flex flex-col gap-1 text-sm text-gray-700">
                {t('discover.geoPerimeter')}
                <span className="text-[11px] leading-snug text-gray-500 font-normal">
                  {geoPerimeter === 'international'
                    ? t('discover.intlHintWorldwide')
                    : geoPerimeter === 'la_france_dans_le_monde'
                      ? t('discover.intlHintFranceWorld')
                      : t('discover.exclusiveHint')}
                </span>
                <GeoPerimeterSelect
                  value={geoPerimeter}
                  disabled={!filtersActive}
                  onChange={(next) => {
                    if (!filtersActive) return;
                    if (isGeoPerimeterFilter(next)) {
                      setPrefs((prev) => ({
                        ...prev,
                        geoPerimeter: next,
                        geoExclusive: geoExclusiveApplies(next)
                          ? prev.geoExclusive
                          : false,
                      }));
                    }
                  }}
                />
                {isFranceHexagonePerimeter(geoPerimeter) ? (
                  <FranceStrataSelect
                    value={geoPerimeter}
                    exclusive={geoExclusive}
                    disabled={!filtersActive}
                    onChange={(next) => {
                      if (!filtersActive) return;
                      if (isGeoPerimeterFilter(next)) {
                        setPrefs((prev) => ({
                          ...prev,
                          geoPerimeter: next,
                          geoExclusive: geoExclusiveApplies(next)
                            ? prev.geoExclusive
                            : false,
                        }));
                      }
                    }}
                    onExclusiveChange={(next) => {
                      if (!filtersActive) return;
                      setPrefs((prev) => ({ ...prev, geoExclusive: next }));
                    }}
                  />
                ) : null}
                {geoPerimeter === 'international' ? (
                  <WorldZoneSelect
                    value={worldZones}
                    countries={internationalCountries}
                    disabled={!filtersActive}
                    onChange={(next) => {
                      if (!filtersActive) return;
                      setPrefs((prev) => ({
                        ...prev,
                        worldZones: next.worldZones,
                        internationalCountries: next.internationalCountries,
                      }));
                    }}
                  />
                ) : null}
                {geoPerimeter === 'la_france_dans_le_monde' ? (
                  <FranceWorldSelect
                    value={franceWorldChoice}
                    codes={franceWorldCodes}
                    disabled={!filtersActive}
                    onChange={(next) => {
                      if (!filtersActive) return;
                      setPrefs((prev) => ({
                        ...prev,
                        franceWorldChoice: next.choice,
                        franceWorldCodes: next.codes,
                      }));
                    }}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-1 text-sm text-gray-700">
                {t('discover.interestsInCommonMin')}
                <InterestOverlapSelect
                  value={minOverlap}
                  disabled={!filtersActive}
                  onChange={(next) => {
                    if (!filtersActive) return;
                    setPrefs((prev) => ({ ...prev, minOverlap: next }));
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <AdvancedFiltersTeaser
          locked={!status.can_use_advanced_filters}
          onAskPremium={() => setShowFiltersHint(true)}
          priceLabel={priceLabel}
          status={status}
        />
      )}

      {showFiltersHint && !status.can_use_advanced_filters && !SITE_FREE_MODE && (
        <SoftPremiumBanner
          title={t('discover.advancedFilters')}
          description={
            isFounderPeriodActive(status) || status.plan === 'premium'
              ? t('discover.premiumFiltersIncluded', {
                  offer: offerLabel(status),
                  price: priceLabel ? ` (${priceLabel})` : '',
                })
              : priceLabel
                ? t('discover.premiumFiltersLockedPrice', { price: priceLabel })
                : SITE_FREE_MODE
                  ? t('discover.premiumFiltersFreeMode')
                  : t('discover.premiumFiltersLocked')
          }
          priceLabel={priceLabel}
        />
      )}

      {displayError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      )}

      {toast && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm px-3 py-2 text-center animate-pop">
          {toast}
        </div>
      )}

      {searching ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            <div className="text-gray-400 text-sm">{t('discover.searching')}</div>
          </div>
        </div>
      ) : displayError ? null : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-50 to-amber-50 flex items-center justify-center">
            <Heart className="w-9 h-9 text-rose-300" />
          </div>
          {filtersActive && hasActiveFilter ? (
            <p className="text-gray-600 text-sm max-w-sm leading-relaxed">
              {t('discover.emptyFilters')}
            </p>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900">
                {t('discover.emptyEndTitle')}
              </h2>
              <p className="text-gray-500 max-w-sm">
                {t('discover.emptyEndBody')}
              </p>
            </>
          )}
          {!canFilter && !SITE_FREE_MODE && (
            <div className="w-full max-w-sm">
              <SoftPremiumBanner
                title={t('discover.refineTitle')}
                description={
                  isFounderPeriodActive(status) || status.plan === 'premium'
                    ? t('discover.refineIncluded', {
                        offer: offerLabel(status),
                        price: priceLabel ? ` (${priceLabel})` : '',
                      })
                    : priceLabel
                      ? t('discover.refinePremiumPrice', { price: priceLabel })
                      : SITE_FREE_MODE
                        ? t('discover.refineFree')
                        : t('discover.refinePremium')
                }
                priceLabel={priceLabel}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-gray-400">{countLabel}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <button
                type="button"
                id="discovery-sort-label"
                role="switch"
                aria-checked={sortEnabled}
                aria-controls="discovery-sort-pills"
                className={`discovery-sort-toggle${sortEnabled ? ' discovery-sort-toggle--on' : ''}`}
                onClick={handleSortToggle}
              >
                <span className="discovery-sort-toggle-track" aria-hidden>
                  <span className="discovery-sort-toggle-thumb" />
                </span>
                <span className="discovery-sort-toggle-text">{t('discover.sortBy')}</span>
              </button>
              <div
                id="discovery-sort-pills"
                role="radiogroup"
                aria-labelledby="discovery-sort-label"
                aria-disabled={!sortEnabled}
                className={`discovery-sort-pills flex flex-wrap gap-1.5${
                  sortEnabled ? '' : ' discovery-sort-pills--off'
                }`}
                onClickCapture={(event) => {
                  if (sortEnabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerDownCapture={(event) => {
                  if (sortEnabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
              {SORT_OPTIONS.map((option) => {
                const selected = sortEnabled && sortChoice === option.id;
                const hint = sortHints[option.id];
                return (
                  <div
                    key={option.id}
                    className={`discovery-sort-pill${selected ? ' discovery-sort-pill--active' : ''}`}
                  >
                    <span className="discovery-sort-hint" aria-hidden="true">
                      <span className="discovery-sort-hint-panel">
                        <span className="discovery-sort-hint-inner">{hint}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-disabled={!sortEnabled}
                      disabled={!sortEnabled}
                      tabIndex={sortEnabled ? 0 : -1}
                      aria-label={`${t(option.labelKey)}. ${hint}`}
                      onClick={() => {
                        if (!sortEnabled) return;
                        setSortChoice(option.id);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all ${
                        selected
                          ? 'discovery-sort-pill-active'
                          : 'bg-white text-gray-800 border-gray-200 hover:bg-neutral-50 hover:border-gray-300'
                      }`}
                    >
                      <span className="sort-icon" aria-hidden>
                        {option.icon === 'palette' ? (
                          <PaletteSortIcon />
                        ) : (
                          option.icon
                        )}
                      </span>
                      {t(option.labelKey)}
                    </button>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {displayed.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {sortEnabled && sortChoice === 'nouveaux'
                ? t('discover.emptyPeriod')
                : t('discover.emptyMasked')}
            </p>
          ) : (
          <ul className="profile-cards-grid overflow-visible">
            {displayed.map((c, index) => (
                <DiscoveryCard
                  key={c.id}
                  candidate={c}
                  geoPerimeter={geoPerimeter}
                  eager={index < 4}
                  unreadCount={unreadBySender[c.id] || 0}
                  alreadyFlashed={flashedIds.has(c.id)}
                  alreadyLiked={likedIds.has(c.id)}
                  busy={actingId === c.id}
                  likesExhausted={likesExhausted}
                  showFlashCta={showFlashCta}
                  onOpen={openCandidate}
                  onOpenUnread={openUnread}
                  onSkip={handleSkip}
                  onFlash={handleFlash}
                  onLike={handleLike}
                  onDialogue={openDialogue}
                />
            ))}
          </ul>
          )}

          <div className="pt-1 space-y-2">
            {showFlashCta && (
              <p className="flex items-center justify-center flex-wrap gap-x-1 gap-y-0.5 text-center text-xs text-amber-700/80">
                <span className="inline-flex items-center gap-0.5">
                  <Zap className="w-3 h-3" aria-hidden />
                  Flash
                </span>
                <span aria-hidden>&amp;</span>
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="w-3 h-3" fill="currentColor" aria-hidden />
                  Like
                </span>
                <span>
                  {t('discover.flashLikeHint')}
                  {status.plan !== 'premium' && !isFounderPeriodActive(status)
                    ? t('discover.flashLikeHintFreemium')
                    : ''}
                </span>
              </p>
            )}
            <LikesQuotaHint status={status} />
          </div>
        </div>
      )}

      {chatPeer && (
        <ChatScreen
          peer={chatPeer}
          onDialogueStarted={() => {
            invalidateLikeFlashEdges(userId || '');
          }}
          onClose={() => setChatPeer(null)}
        />
      )}

      {openProfile && (
        <ProfileDetailModal
          candidate={openProfile}
          geoPerimeter={geoPerimeter}
          alreadyFlashed={flashedIds.has(openProfile.id)}
          alreadyLiked={likedIds.has(openProfile.id)}
          busy={actingId === openProfile.id}
          likesExhausted={likesExhausted}
          showFlashCta={showFlashCta}
          unreadCount={unreadBySender[openProfile.id] || 0}
          onClose={() => setOpenProfile(null)}
          onLike={() => void handleLike(openProfile)}
          onFlash={() => void handleFlash(openProfile)}
          onSkip={() => handleSkip(openProfile.id)}
          onOpenChat={
            (unreadBySender[openProfile.id] || 0) > 0 && onOpenUnreadChat
              ? () => onOpenUnreadChat(openProfile.id)
              : undefined
          }
        />
      )}
    </div>
  );
}

function DiscoveryActionButton({
  tooltip,
  tooltipClassName,
  className,
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string;
  /** Classes additionnelles pour l'infobulle (ex. !bg-white !text-gray-600 pour dévier de l'ambré par défaut). */
  tooltipClassName?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);

  return (
    <>
      <span
        className="inline-flex"
        onPointerEnter={() => setTipOpen(true)}
        onPointerLeave={() => setTipOpen(false)}
      >
        <button
          {...props}
          ref={ref}
          type="button"
          className={className}
          onClick={onClick}
          onFocus={() => setTipOpen(true)}
          onBlur={() => setTipOpen(false)}
        >
          {children}
        </button>
      </span>
      <PortaledActionTooltip
        open={tipOpen}
        anchorRef={ref}
        tooltipClassName={tooltipClassName}
      >
        {tooltip}
      </PortaledActionTooltip>
    </>
  );
}

const DiscoveryCard = memo(function DiscoveryCard({
  candidate: c,
  geoPerimeter,
  eager,
  unreadCount,
  alreadyFlashed,
  alreadyLiked,
  busy,
  likesExhausted,
  showFlashCta,
  onOpen,
  onOpenUnread,
  onSkip,
  onFlash,
  onLike,
  onDialogue,
}: {
  candidate: Candidate;
  geoPerimeter: GeoPerimeterFilter;
  eager: boolean;
  unreadCount: number;
  alreadyFlashed: boolean;
  alreadyLiked: boolean;
  busy: boolean;
  likesExhausted: boolean;
  showFlashCta: boolean;
  onOpen: (c: Candidate) => void;
  onOpenUnread: (c: Candidate) => void;
  onSkip: (id: string) => void;
  onFlash: (c: Candidate) => void;
  onLike: (c: Candidate) => void;
  onDialogue: (c: Candidate) => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <article
        className={`relative isolate rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all animate-fadeIn cursor-pointer ${
          unreadCount > 0
            ? 'border-rose-300 ring-2 ring-rose-100'
            : 'border-gray-100 hover:border-rose-100'
        }`}
      >
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-pointer"
          onClick={() => onOpen(c)}
          aria-label={
            unreadCount > 0
              ? t('discover.viewProfileUnread', {
                  name: c.display_name,
                  unread: unreadMessagesLabel(unreadCount),
                })
              : t('discover.viewProfile', { name: c.display_name })
          }
        />
        <div className="aspect-[4/5] bg-gradient-to-br from-rose-100 to-amber-100 relative z-[2] pointer-events-none overflow-hidden rounded-t-2xl">
          {c.photo_url ? (
            <ProfilePhoto
              src={c.photo_url}
              eager={eager}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/80">
              {c.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <OnlinePresenceDot online={c.is_online} />
          <ProfileCardCornerBadges
            age={c.age}
            isFounder={c.is_founder}
            founderNumber={c.founder_number}
          />
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenUnread(c);
              }}
              className={`pointer-events-auto absolute right-2 z-10 inline-flex items-center gap-1 pl-1.5 pr-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-md hover:bg-rose-600 bottom-2`}
              aria-label={unreadMessagesLabel(unreadCount)}
            >
              <MessageCircle className="w-3 h-3" />
              {unreadCount > 9 ? '9+' : unreadCount}
            </button>
          )}
        </div>
        <div className="p-3 space-y-1.5">
          <p className="text-sm font-bold text-gray-900 truncate">
            {c.display_name}
          </p>
          {isInternationalPerimeter(geoPerimeter) ? (
            <InternationalCardGeoFacts
              {...formatInternationalGeoFacts({
                worldZone: c.world_zone,
                countryCode: c.country_code,
                cityName: c.city_name,
                location: c.location,
                distanceKm: c.distance_km,
              })}
            />
          ) : (
            <>
              {c.location && (
                <p className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {c.location}
                </p>
              )}
              <CardGeoFacts
                flags={c}
                location={c.location}
                perimeter={geoPerimeter}
                distanceKm={c.distance_km}
              />
            </>
          )}
          {c.mutual_interests.length > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
              <Sparkles className="w-3 h-3 shrink-0" />
              {t('discover.mutualInterest', {
                count: c.mutual_interests.length,
              })}
            </p>
          )}
          <div
            className="relative z-[2] flex items-center justify-center gap-2 pt-1.5 overflow-visible"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {showFlashCta && (
              <DiscoveryActionButton
                tooltip={alreadyFlashed ? t('discover.alreadyFlashedTooltip') : t('discover.sendFlashTooltip')}
                onClick={(e) => {
                  e.stopPropagation();
                  onFlash(c);
                }}
                disabled={busy || alreadyFlashed}
                className="relative w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
                aria-label={
                  alreadyFlashed
                    ? t('discover.alreadyFlashedName', { name: c.display_name })
                    : t('discover.flashProfile', { name: c.display_name })
                }
              >
                <Zap className="w-4 h-4 text-white" fill="white" />
              </DiscoveryActionButton>
            )}
            <DiscoveryActionButton
              tooltip={
                alreadyLiked
                  ? t('discover.alreadyLikedTooltip')
                  : likesExhausted
                    ? t('discover.likesLimitReached')
                    : t('discover.likeThisProfile', {
                        emoji: LIKE_NOTIFICATION_EMOJI,
                      })
              }
              onClick={(e) => {
                e.stopPropagation();
                onLike(c);
              }}
              disabled={busy || likesExhausted || alreadyLiked}
              className="relative w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
              aria-label={
                alreadyLiked
                  ? t('discover.alreadyLikedName', { name: c.display_name })
                  : t('discover.likeProfile', { name: c.display_name })
              }
            >
              <Heart className="w-4 h-4 text-white" fill="white" />
            </DiscoveryActionButton>
            {isSimplifiedDiscoverMode(c.discover_mode) ? (
              <DiscoveryActionButton
                tooltip={t('discover.dialogueTooltip')}
                onClick={(e) => {
                  e.stopPropagation();
                  onDialogue(c);
                }}
                disabled={busy}
                className="relative w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
                aria-label={t('discover.dialogueProfile', {
                  name: c.display_name,
                })}
              >
                <MessageCircle className="w-4 h-4 text-white" />
              </DiscoveryActionButton>
            ) : null}
            <DiscoveryActionButton
              tooltip={t('matches.hide')}
              tooltipClassName="!bg-white/95 !text-gray-600 !border-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                onSkip(c.id);
              }}
              className="relative w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform cursor-pointer"
              aria-label={t('discover.hideName', { name: c.display_name })}
            >
              <X className="w-4 h-4 text-gray-400" />
            </DiscoveryActionButton>
          </div>
        </div>
      </article>
    </li>
  );
});
