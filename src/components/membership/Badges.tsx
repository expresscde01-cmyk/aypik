import { Award, Sparkles } from 'lucide-react';

export function FounderBadge({
  number,
  size = 'md',
}: {
  number?: number | null;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  const icon = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200 ${pad}`}
      title="Membre Fondateur"
    >
      <Award className={icon} />
      Membre Fondateur
      {typeof number === 'number' ? ` #${number}` : ''}
    </span>
  );
}

export function BoostedBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  const icon = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-rose-500 text-white font-semibold shadow-sm shadow-rose-200 ${pad}`}
      title="Profil boosté"
    >
      <Sparkles className={icon} />
      Boosté
    </span>
  );
}

/** Badges photo partagés (Accueil + Découvrir) : âge à droite, Boosté / Fondateur empilés à gauche. */
export function ProfileCardCornerBadges({
  age,
  isBoosted,
  isFounder,
  founderNumber,
}: {
  age: number;
  isBoosted?: boolean;
  isFounder?: boolean;
  founderNumber?: number | null;
}) {
  return (
    <>
      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[11px] font-semibold backdrop-blur-sm">
        {age} ans
      </span>
      {(isBoosted || isFounder) && (
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start max-w-[70%]">
          {isBoosted ? <BoostedBadge size="sm" /> : null}
          {isFounder ? (
            <FounderBadge number={founderNumber} size="sm" />
          ) : null}
        </div>
      )}
    </>
  );
}

export function PremiumBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  const icon = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-100 ${pad}`}
    >
      <Sparkles className={icon} />
      Premium
    </span>
  );
}
