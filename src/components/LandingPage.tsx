import { Check, Gift, Heart, HeartHandshake, ShieldCheck, Sparkles, Zap, UserRound } from 'lucide-react';
import { BrandLockup, BrandMark, BRAND_GRADIENT_CSS } from '@/components/BrandLockup';
import { LegalLink } from '@/components/LegalTerms';
import { useMembership } from '@/lib/useMembership';

const FOUNDER_SUBTITLE =
  '6 mois offerts — Offre exclusive réservée aux 500 premiers membres.';

const FREEMIUM_ACTIVE_UNSELECTED_LABEL =
  'Non sélectionné - votre offre Freemium est active';

const VALUES = [
  {
    id: 'confiance',
    title: 'Confiance & Vérification',
    description:
      'Un espace sécurisé où chaque profil est authentifié.',
    Icon: ShieldCheck,
  },
  {
    id: 'bienveillance',
    title: 'Bienveillance & Respect',
    description:
      'Une communauté fondée sur la compréhension mutuelle et l’écoute.',
    Icon: HeartHandshake,
  },
  {
    id: 'vecu-commun',
    title: 'Un vécu commun',
    description:
      'Un environnement dédié au partage d’un même mode de vie ou d’un vécu commun.',
    Icon: Sparkles,
  },
] as const;

type OfferAccent = 'founder' | 'premium' | 'boost' | 'freemium';

type OfferDef = {
  id: OfferAccent;
  title: string;
  badge?: string;
  description: string;
  point?: string;
  accent: OfferAccent;
};

const OFFERS: OfferDef[] = [
  {
    id: 'founder',
    title: 'Membre Fondateur',
    badge: 'Offre limitée',
    description: FOUNDER_SUBTITLE,
    point: 'Inscription sans carte bancaire',
    accent: 'founder',
  },
  {
    id: 'premium',
    title: 'Offre Premium',
    description:
      '19,99 € / mois pour un confort d’utilisation, sans engagement.',
    accent: 'premium',
  },
  {
    id: 'boost',
    title: 'Boost 24h',
    description:
      'Visibilité maximale pendant 24 h. Achat ponctuel, disponible à tout moment.',
    accent: 'boost',
  },
  {
    id: 'freemium',
    title: 'Offre Freemium',
    description: 'Notre offre standard gratuite, sans engagement.',
    accent: 'freemium',
  },
];

export function SiteHeader({
  displayName,
  onAuthClick,
  onSignOut,
  onLogoClick,
}: {
  displayName?: string | null;
  onAuthClick?: () => void;
  onSignOut?: () => void;
  onLogoClick?: () => void;
}) {
  const connected = Boolean(displayName);

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-rose-100/80">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onLogoClick?.();
            if (window.location.pathname !== '/') {
              window.history.pushState({}, '', '/');
            }
          }}
          className="flex items-center gap-2.5 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
          aria-label="Accueil Aypik"
        >
          <BrandMark size="sm" />
          <BrandLockup />
        </a>

        <div className="shrink-0">
          {connected ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 max-w-[9rem] sm:max-w-[12rem] truncate text-sm font-semibold text-gray-800">
                <UserRound className="w-4 h-4 text-rose-500 shrink-0" />
                {displayName}
              </span>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Déconnexion
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onAuthClick}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold shadow-md shadow-rose-200/60 hover:opacity-95 transition-opacity"
            >
              Connexion / Inscription
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function OfferCard({
  title,
  badge,
  description,
  point,
  note,
  accent,
  highlighted = false,
  locked = false,
}: {
  title: string;
  badge?: string;
  description: string;
  point?: string;
  note?: string;
  accent: OfferAccent;
  highlighted?: boolean;
  locked?: boolean;
}) {
  const Icon =
    accent === 'founder'
      ? Gift
      : accent === 'premium'
        ? Sparkles
        : accent === 'boost'
          ? Zap
          : Heart;

  if (highlighted && accent === 'freemium') {
    return (
      <article className="relative overflow-hidden rounded-3xl border-2 border-cyan-200 bg-gradient-to-br from-sky-500 via-cyan-400 to-sky-200 shadow-lg shadow-cyan-200/50 p-5 sm:p-6 sm:col-span-2 animate-fadeIn">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'radial-gradient(circle at 88% 14%, rgba(255,255,255,0.55) 0%, transparent 42%), radial-gradient(circle at 12% 80%, rgba(224,242,254,0.65) 0%, transparent 48%), radial-gradient(circle at 45% 35%, rgba(34,211,238,0.25) 0%, transparent 45%)',
          }}
        />
        <div className="relative space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-900 border border-white/80 shadow-sm">
            <Check className="w-3.5 h-3.5" />
            Offre active
          </span>
          <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-sky-950">
            {title}
          </h3>
          <p className="text-sm sm:text-base font-semibold text-sky-950/85 leading-snug">
            {description}
          </p>
          {point && (
            <p className="flex items-start gap-2 text-sm font-semibold text-sky-950">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/85">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              </span>
              {point}
            </p>
          )}
        </div>
      </article>
    );
  }

  if (locked) {
    return (
      <article
        aria-disabled="true"
        className="relative overflow-hidden rounded-3xl border-2 border-gray-200 bg-gray-50 p-5 sm:p-6 opacity-55 grayscale pointer-events-none select-none animate-fadeIn"
      >
        <div className="relative space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-200 text-gray-500">
              <Icon className="w-4 h-4" />
            </span>
          </div>
          <h3 className="text-xl font-extrabold tracking-tight text-gray-700">
            {title}
          </h3>
          <p className="text-sm font-medium leading-snug text-gray-500">
            {description}
          </p>
          {note && (
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
              {note}
            </p>
          )}
        </div>
      </article>
    );
  }

  const shell =
    accent === 'founder'
      ? 'border-amber-300 bg-gradient-to-br from-amber-400 via-amber-300 to-rose-300'
      : accent === 'premium'
        ? 'border-rose-200 bg-white'
        : accent === 'boost'
          ? 'border-amber-200 bg-white'
          : 'border-cyan-200 bg-white';

  const titleColor =
    accent === 'founder' ? 'text-amber-950' : 'text-gray-900';
  const bodyColor =
    accent === 'founder' ? 'text-amber-950/85' : 'text-gray-600';
  const pointClass =
    accent === 'founder' ? 'text-amber-950' : 'text-gray-800';
  const bulletClass =
    accent === 'founder' ? 'bg-white/80' : 'bg-rose-50';

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border-2 p-5 sm:p-6 ${shell} animate-fadeIn`}
    >
      {accent === 'founder' && (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(255,255,255,0.85) 0%, transparent 45%), radial-gradient(circle at 88% 10%, rgba(255,255,255,0.55) 0%, transparent 40%)',
          }}
        />
      )}
      <div className="relative space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {badge && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 border border-white/80 shadow-sm">
              <Gift className="w-3.5 h-3.5" />
              {badge}
            </span>
          )}
          {accent !== 'founder' && (
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                accent === 'premium'
                  ? 'bg-rose-50 text-rose-500'
                  : accent === 'boost'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-cyan-50 text-cyan-600'
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
          )}
        </div>
        <h3 className={`text-xl font-extrabold tracking-tight ${titleColor}`}>
          {title}
        </h3>
        <p className={`text-sm sm:text-base font-medium leading-snug ${bodyColor}`}>
          {description}
        </p>
        {point && (
          <p className={`flex items-start gap-2 text-sm font-semibold ${pointClass}`}>
            <span
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${bulletClass}`}
            >
              ✓
            </span>
            {point}
          </p>
        )}
      </div>
    </article>
  );
}

export default function LandingPage({
  displayName,
  onAuthClick,
  onSignOut,
  onLogoClick,
  onPrimaryCta,
  onValidateSignup,
}: {
  displayName?: string | null;
  onAuthClick?: () => void;
  onSignOut?: () => void;
  onLogoClick?: () => void;
  /** CTA principal (ex. aller aux matchs si déjà connecté) */
  onPrimaryCta?: () => void;
  /** Ouvre le formulaire « Valider mon inscription » */
  onValidateSignup?: () => void;
}) {
  const connected = Boolean(displayName);
  const { status } = useMembership();

  const onFounderBenefits =
    status.on_founder_trial ||
    (status.is_founder &&
      !!status.founder_premium_until &&
      new Date(status.founder_premium_until).getTime() > Date.now());

  const onFreemium =
    connected &&
    status.membership_linked &&
    !status.is_founder &&
    !onFounderBenefits &&
    status.plan !== 'premium' &&
    status.plan !== 'founder';

  const boostPurchased = status.has_boost;

  type VisibleOffer = {
    id: (typeof OFFERS)[number]['id'];
    title: string;
    badge?: string;
    description: string;
    point?: string;
    accent: (typeof OFFERS)[number]['accent'];
    highlighted: boolean;
    locked: boolean;
    note?: string;
  };

  const visibleOffers: VisibleOffer[] = onFreemium
    ? [
        {
          ...OFFERS.find((o) => o.id === 'freemium')!,
          description: 'Gratuit — l’essentiel d’Aypik, sans engagement.',
          point: 'Sans carte bancaire',
          highlighted: true,
          locked: false,
        },
        {
          ...OFFERS.find((o) => o.id === 'founder')!,
          highlighted: false,
          locked: true,
          note: FREEMIUM_ACTIVE_UNSELECTED_LABEL,
        },
        {
          ...OFFERS.find((o) => o.id === 'premium')!,
          highlighted: false,
          locked: true,
          note: FREEMIUM_ACTIVE_UNSELECTED_LABEL,
        },
        {
          ...OFFERS.find((o) => o.id === 'boost')!,
          highlighted: false,
          locked: !boostPurchased,
          note: boostPurchased
            ? undefined
            : FREEMIUM_ACTIVE_UNSELECTED_LABEL,
        },
      ]
    : OFFERS.map((offer) => ({
        ...offer,
        highlighted: false,
        locked: false,
        note: undefined,
      }));

  return (
    <div className="min-h-full flex flex-col bg-[#fff8f5]">
      <SiteHeader
        displayName={displayName}
        onAuthClick={onAuthClick}
        onSignOut={onSignOut}
        onLogoClick={onLogoClick}
      />

      {/* Hero / Philosophie — une composition, brand first */}
      <section className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% -10%, rgba(251,113,133,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 40%, rgba(251,191,36,0.22), transparent 50%), linear-gradient(180deg, #fff5f2 0%, #fffaf7 45%, #fff8f5 100%)',
          }}
        />
        <div className="max-w-3xl mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-20 text-center">
          <h1 className="max-w-xl sm:max-w-2xl mx-auto text-3xl sm:text-4xl md:text-[2.75rem] font-extrabold text-gray-900 tracking-tight leading-[1.2] text-balance animate-pop">
            Un espace bienveillant réservé exclusivement aux personnes{' '}
            <span className="whitespace-nowrap">sans enfants</span>
          </h1>

          {/* Signature de marque sous l’accroche */}
          <div className="mt-8 flex flex-col items-center gap-3 animate-fadeIn">
            <BrandMark size="md" />
            <p
              className="w-fit mx-auto text-xl sm:text-2xl font-extrabold uppercase tracking-[0.32em] bg-clip-text text-transparent"
              style={{ backgroundImage: BRAND_GRADIENT_CSS }}
              aria-label="Aypik"
            >
              Aypik
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fadeIn">
            {connected && onValidateSignup ? (
              <button
                type="button"
                onClick={onValidateSignup}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/70 hover:opacity-95 transition-opacity"
              >
                Validez votre inscription
              </button>
            ) : (
              <button
                type="button"
                onClick={connected ? onPrimaryCta : onAuthClick}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/70 hover:opacity-95 transition-opacity"
              >
                {connected ? 'Voir mes matchs' : 'Rejoindre Aypik'}
              </button>
            )}
            {connected && onValidateSignup ? (
              <button
                type="button"
                onClick={onPrimaryCta}
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-rose-200 bg-white/70 text-gray-800 font-semibold hover:bg-white transition-colors"
              >
                Voir mes matchs
              </button>
            ) : (
              !connected && (
                <button
                  type="button"
                  onClick={onAuthClick}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-rose-200 bg-white/70 text-gray-800 font-semibold hover:bg-white transition-colors"
                >
                  Se connecter
                </button>
              )
            )}
          </div>
        </div>
      </section>

      {/* Valeurs */}
      <section className="max-w-3xl mx-auto w-full px-4 pb-14 sm:pb-16">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Valeurs
          </h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Les piliers d’une communauté claire, sereine et respectueuse.
          </p>
        </div>
        <ul className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {VALUES.map(({ id, title, description, Icon }) => (
            <li key={id} className="text-center sm:text-left">
              <div className="mx-auto sm:mx-0 mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-md text-orange-500">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <h3 className="text-base font-bold text-gray-900 tracking-tight leading-snug">
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed text-pretty">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Offres */}
      <section className="max-w-3xl mx-auto w-full px-4 pb-16 sm:pb-20">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            {onFreemium ? 'Votre offre' : 'Nos offres'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {onFreemium
              ? 'Freemium est active. Pour finaliser, utilisez le bouton ci-dessous.'
              : 'Une entrée libre, des options pour aller plus loin.'}
          </p>
          {onFreemium && onValidateSignup && (
            <button
              type="button"
              onClick={onValidateSignup}
              className="mt-5 w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200/70 hover:opacity-95 transition-opacity"
            >
              Validez votre inscription
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              title={offer.title}
              badge={offer.locked ? undefined : offer.badge}
              description={offer.description}
              point={offer.locked ? undefined : offer.point}
              note={offer.note}
              accent={offer.accent}
              highlighted={offer.highlighted}
              locked={offer.locked}
            />
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-rose-100/80 bg-white/60">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-gray-400 leading-relaxed">
          Aypik ·{' '}
          <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors">
            CGU / CGV
          </LegalLink>
        </div>
      </footer>
    </div>
  );
}
