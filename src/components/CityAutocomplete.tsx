import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Loader2, Check } from 'lucide-react';
import {
  searchFrenchCommunes,
  type GeoCommune,
} from '@/lib/geoCommunes';

type CityAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  /** Commune officielle validée (null = saisie libre non validée) */
  selected: GeoCommune | null;
  onSelect: (commune: GeoCommune | null) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  invalid?: boolean;
};

export function CityAutocomplete({
  value,
  onChange,
  selected,
  onSelect,
  placeholder = 'Paris, Lyon…',
  id,
  className = '',
  invalid = false,
}: CityAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GeoCommune[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  /** Évite de relancer une recherche juste après une sélection */
  const skipFetchRef = useRef(false);

  const isValidated =
    selected !== null && selected.label === value.trim();

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    // Ville déjà validée : pas de nouvelle recherche tant que le texte ne change pas
    if (selected && selected.label === value.trim()) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setQueryError(null);
      return;
    }

    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setQueryError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setQueryError(null);
      try {
        const results = await searchFrenchCommunes(q, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setHighlight(0);
        setOpen(results.length > 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggestions([]);
        setOpen(false);
        setQueryError(
          err instanceof Error
            ? err.message
            : 'Impossible de charger les suggestions.'
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, selected]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const selectCommune = (commune: GeoCommune) => {
    skipFetchRef.current = true;
    onChange(commune.label);
    onSelect(commune);
    setSuggestions([]);
    setOpen(false);
    setLoading(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = suggestions[highlight];
      if (chosen) selectCommune(chosen);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          id={id}
          type="text"
          autoComplete="off"
          required
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-activedescendant={
            open && suggestions[highlight]
              ? `${listId}-option-${highlight}`
              : undefined
          }
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            // Toute retouche manuelle invalide la sélection officielle
            if (!selected || next.trim() !== selected.label) {
              onSelect(null);
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0 && !isValidated) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`w-full pl-10 pr-10 py-3 rounded-xl border outline-none transition-all text-gray-900 placeholder-gray-400 focus:ring-2 ${
            invalid
              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
              : isValidated
                ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100'
                : 'border-gray-200 focus:border-rose-400 focus:ring-rose-100'
          }`}
          placeholder={placeholder}
        />
        {loading ? (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400 animate-spin" />
        ) : isValidated ? (
          <Check
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500"
            aria-hidden
          />
        ) : null}
      </div>

      {isValidated && (
        <p className="mt-1.5 text-xs text-emerald-700">
          Ville officielle sélectionnée
          {selected.codesPostaux[0]
            ? ` · CP ${selected.codesPostaux.length > 1 ? `${[...selected.codesPostaux].sort()[0]}–${[...selected.codesPostaux].sort().at(-1)}` : selected.codesPostaux[0]}`
            : ''}
        </p>
      )}

      {queryError && (
        <p className="mt-1.5 text-xs text-amber-700">{queryError}</p>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1.5 w-full max-h-60 overflow-auto rounded-xl border border-rose-100 bg-white shadow-lg shadow-rose-100/50 py-1"
        >
          {suggestions.map((commune, index) => {
            const active = index === highlight;
            const cp =
              commune.codesPostaux.length === 1
                ? commune.codesPostaux[0]
                : commune.codesPostaux.length > 1
                  ? `${[...commune.codesPostaux].sort()[0]}–${[...commune.codesPostaux].sort().at(-1)}`
                  : '';
            return (
              <li key={commune.code || commune.label} role="presentation">
                <button
                  type="button"
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectCommune(commune);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${
                    active ? 'bg-rose-50 text-rose-900' : 'text-gray-800'
                  }`}
                >
                  <span className="font-semibold truncate">{commune.nom}</span>
                  {cp && (
                    <span
                      className={`shrink-0 text-xs font-medium tabular-nums ${
                        active ? 'text-rose-600' : 'text-gray-500'
                      }`}
                    >
                      {cp}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
