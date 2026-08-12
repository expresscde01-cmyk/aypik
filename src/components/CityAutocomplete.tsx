import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-react';
import {
  searchCommunes,
  type CommuneSuggestion,
} from '@/lib/geoCommunes';

type CityAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  required?: boolean;
  placeholder?: string;
  id?: string;
};

export function CityAutocomplete({
  value,
  onChange,
  selected,
  onSelectedChange,
  required = false,
  placeholder = 'Rechercher une ville…',
  id,
}: CityAutocompleteProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<CommuneSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (selected) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setSearchError(null);
      return;
    }

    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const results = await searchCommunes(q, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setOpen(true);
        setActiveIndex(results.length > 0 ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSearchError(
          err instanceof Error ? err.message : 'Erreur de recherche.'
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const pickSuggestion = (suggestion: CommuneSuggestion) => {
    onChange(suggestion.label);
    onSelectedChange(true);
    setQuery(suggestion.label);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    setSearchError(null);
  };

  const handleInputChange = (next: string) => {
    setQuery(next);
    onChange(next);
    if (selected) onSelectedChange(false);
    setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (suggestions.length > 0) setOpen(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setActiveIndex(
        (prev) => (prev - 1 + suggestions.length) % suggestions.length
      );
      return;
    }

    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) pickSuggestion(suggestion);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const showList = open && !selected && (loading || suggestions.length > 0 || !!searchError);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          required={required}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (!selected && (suggestions.length > 0 || query.trim().length >= 2)) {
              setOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-11 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : selected ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {searchError ? (
            <li className="px-3 py-2.5 text-sm text-red-600">{searchError}</li>
          ) : loading && suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-gray-500">Recherche…</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-gray-500">
              Aucune ville trouvée
            </li>
          ) : (
            suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex;
              return (
                <li
                  key={`${suggestion.code}-${suggestion.label}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                >
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-rose-50 text-rose-700'
                        : 'text-gray-800 hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pickSuggestion(suggestion)}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate">{suggestion.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
