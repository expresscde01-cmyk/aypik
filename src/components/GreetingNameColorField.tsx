import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MemberGreeting from '@/components/MemberGreeting';
import {
  GREETING_NAME_COLORS,
  greetingNamePaintStyle,
  resolveGreetingNameColor,
  type GreetingNameColor,
} from '@/lib/greetingNameColor';

export default function GreetingNameColorField({
  name,
  gender,
  value,
  onChange,
}: {
  name: string;
  gender: string | null | undefined;
  value: GreetingNameColor | null;
  onChange: (next: GreetingNameColor | null) => void;
}) {
  const { t } = useTranslation();
  const resolved = resolveGreetingNameColor(value, gender);
  const labelId = 'greeting-name-color-label';

  const move = (from: GreetingNameColor, direction: 1 | -1) => {
    const index = GREETING_NAME_COLORS.indexOf(from);
    const next =
      GREETING_NAME_COLORS[
        (index + direction + GREETING_NAME_COLORS.length) %
          GREETING_NAME_COLORS.length
      ];
    onChange(next);
    return next;
  };

  return (
    <div className="space-y-3">
      <p id={labelId} className="block text-sm font-semibold text-gray-700">
        {t('profile.greetingColor')}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="greeting-color-options"
        onKeyDown={(event) => {
          const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
          const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
          if (!forward && !backward) return;
          event.preventDefault();
          const next = move(resolved, forward ? 1 : -1);
          const option = event.currentTarget.querySelector<HTMLButtonElement>(
            `[data-greeting-color="${next}"]`
          );
          option?.focus();
        }}
      >
        {GREETING_NAME_COLORS.map((id) => {
          const selected = resolved === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              data-greeting-color={id}
              aria-checked={selected}
              aria-label={t(`profile.greetingColors.${id}`)}
              tabIndex={selected ? 0 : -1}
              className="greeting-color-option"
              onClick={() => onChange(id)}
            >
              <span
                className="greeting-color-swatch"
                style={greetingNamePaintStyle(id)}
                aria-hidden="true"
              >
                {selected ? <Check strokeWidth={3} /> : null}
              </span>
              <span className="greeting-color-name">
                {t(`profile.greetingColors.${id}`)}
              </span>
            </button>
          );
        })}
      </div>
      <MemberGreeting
        name={name.trim() || t('profile.displayNamePlaceholder')}
        color={resolved}
        className="greeting-color-preview"
      />
      <button
        type="button"
        className="greeting-color-reset"
        onClick={() => onChange(null)}
        disabled={value == null}
      >
        {t('profile.greetingColorDefault')}
      </button>
    </div>
  );
}
