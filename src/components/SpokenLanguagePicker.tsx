import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import {
  MAX_SPOKEN_LANGUAGES,
  SPOKEN_LEVELS,
  languageDisplayName,
  listedLanguageCodes,
  type Iso6391Code,
  type SpokenDraft,
  type SpokenLevel,
} from '@/lib/spokenLanguages';

const LEVEL_KEY = {
  beginner: 'languages.levels.beginner',
  intermediate: 'languages.levels.intermediate',
  advanced: 'languages.levels.advanced',
  native: 'languages.levels.native',
} as const;

export default function SpokenLanguagePicker({
  drafts,
  onChange,
  nativeRequired,
  showLevels = true,
}: {
  drafts: SpokenDraft[];
  onChange: (next: SpokenDraft[]) => void;
  nativeRequired?: boolean;
  showLevels?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedCodes = drafts.map((item) => item.code);
  const options = useMemo(
    () => listedLanguageCodes(query, locale, selectedCodes),
    [query, locale, selectedCodes]
  );
  const atMax = drafts.length >= MAX_SPOKEN_LANGUAGES;
  const nativeCount = drafts.filter((item) => item.level === 'native').length;
  const listId = 'spoken-language-list';

  const add = (code: Iso6391Code) => {
    if (atMax || drafts.some((item) => item.code === code)) return;
    onChange([...drafts, { code, level: null }]);
    setQuery('');
    setActiveIndex(0);
  };

  const remove = (code: Iso6391Code) => {
    const item = drafts.find((row) => row.code === code);
    if (
      nativeRequired &&
      item?.level === 'native' &&
      nativeCount <= 1
    ) {
      return;
    }
    onChange(drafts.filter((row) => row.code !== code));
  };

  const setLevel = (code: Iso6391Code, level: SpokenLevel) => {
    if (
      nativeRequired &&
      nativeCount <= 1 &&
      drafts.some((row) => row.code === code && row.level === 'native') &&
      level !== 'native'
    ) {
      return;
    }
    onChange(
      drafts.map((row) => (row.code === code ? { ...row, level } : row))
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="spoken-language-search" className="sr-only">
          {t('languages.searchLabel')}
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="spoken-language-search"
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              options[activeIndex] ? `spoken-opt-${options[activeIndex]}` : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((n) => Math.min(n + 1, Math.max(options.length - 1, 0)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((n) => Math.max(n - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const code = options[activeIndex];
                if (code && !atMax) add(code);
              }
            }}
            disabled={atMax}
            autoComplete="off"
            placeholder={t('languages.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none text-sm text-gray-900 placeholder-gray-400"
          />
        </div>
        {!atMax && (
          <ul
            id={listId}
            role="listbox"
            aria-label={t('languages.searchLabel')}
            className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50"
          >
            {options.slice(0, 40).map((code, index) => (
              <li key={code} role="presentation">
                <button
                  type="button"
                  id={`spoken-opt-${code}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => add(code)}
                  className={`w-full text-left px-3 py-2 text-sm text-gray-700 ${
                    index === activeIndex ? 'bg-gray-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {languageDisplayName(code, locale)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {atMax && (
          <p className="mt-1.5 text-xs text-gray-400">{t('languages.maxReached')}</p>
        )}
      </div>

      {drafts.length > 0 && (
        showLevels ? (
        <ul className="space-y-3">
          {drafts.map((item) => {
            const lockNative =
              nativeRequired && item.level === 'native' && nativeCount <= 1;
            return (
              <li
                key={item.code}
                className="rounded-xl border border-gray-100 bg-gray-50/80 p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-800">
                    {languageDisplayName(item.code, locale)}
                    {nativeRequired && item.level === 'native' && (
                      <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-rose-600">
                        {t('languages.required')}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => remove(item.code)}
                    disabled={lockNative}
                    aria-label={t('languages.remove', {
                      name: languageDisplayName(item.code, locale),
                    })}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div
                  role="radiogroup"
                  aria-label={t('languages.levelGroup', {
                    name: languageDisplayName(item.code, locale),
                  })}
                  className="flex flex-wrap gap-2"
                >
                  {SPOKEN_LEVELS.map((level) => {
                    const selected = item.level === level;
                    const blocked = lockNative && level !== 'native';
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={blocked}
                        onClick={() => setLevel(item.code, level)}
                        className={`temperament-chip ${
                          selected ? 'temperament-chip--on' : ''
                        }`}
                      >
                        {t(LEVEL_KEY[level])}
                      </button>
                    );
                  })}
                </div>
                {item.level == null && (
                  <p className="mt-2 text-xs text-amber-800/80">
                    {t('languages.needLevel')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        ) : (
        <ul className="flex flex-wrap gap-2">
          {drafts.map((item) => (
            <li key={item.code}>
              <span className="temperament-chip temperament-chip--on">
                {languageDisplayName(item.code, locale)}
                <button
                  type="button"
                  onClick={() => remove(item.code)}
                  aria-label={t('languages.remove', {
                    name: languageDisplayName(item.code, locale),
                  })}
                  className="p-0.5 rounded-full hover:bg-white/20"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        )
      )}

      {showLevels && (
        <p className="text-xs text-gray-400 leading-relaxed">
          {t('languages.levelHelp')}
        </p>
      )}
    </div>
  );
}
