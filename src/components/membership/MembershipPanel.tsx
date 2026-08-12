import { Award, Bell, Check, Gift, Heart } from 'lucide-react';
import { useState } from 'react';
import { FounderBadge, PremiumBadge } from '@/components/membership/Badges';
import { BoostPurchaseCard } from '@/components/membership/BoostPurchaseCard';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { PremiumConversionCard } from '@/components/membership/PremiumConversionCard';
import { cancelPremiumSubscription, ENABLE_PAYMENTS } from '@/lib/payments';
import {
  daysUntil,
  formatPremiumPriceLabel,
  isFounderAvailable,
  isFounderComplimentaryAccess,
  founderOfferBadgeLabel,
  founderOfferSubtitle,
  AFTER_FOUNDER_TITLE,
  AFTER_FOUNDER_PERIOD_COPY,
  type MembershipStatus,
} from '@/lib/membership';

/** Libellé partagé quand Freemium est l’offre active (cartes secondaires grisées). */
const FREEMIUM_ACTIVE_UNSELECTED_LABEL =
  'Non sélectionné - votre offre Freemium est active';

/** True si la période fondateur à 0 € est encore en cours (sans exiger le flag RPC). */
function isFounderPeriodActive(status: MembershipStatus): boolean {
  if (status.on_founder_trial) return true;
  if (!status.is_founder || !status.founder_premium_until) return false;
  return new Date(status.founder_premium_until).getTime() > Date.now();
}

function FounderActiveBanner({
  status,
  onActivate,
  activating = false,
  exhausted = false,
  locked = false,
  lockedReason = FREEMIUM_ACTIVE_UNSELECTED_LABEL,
  /** Compact = carte secondaire (section « Autres options »). */
  compact = false,
}: {
  status: MembershipStatus;
  onActivate?: () => void;
  activating?: boolean;
  exhausted?: boolean;
  /** Grisé / non interactif (ex. Freemium déjà choisie). */
  locked?: boolean;
  lockedReason?: string;
  compact?: boolean;
}) {
  const showCta = !exhausted && !locked && Boolean(onActivate);

  if (exhausted || locked) {
    if (compact) {
      return (
        <div
          aria-disabled="true"
          className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden opacity-55 grayscale pointer-events-none select-none"
        >
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
            {exhausted && (
              <p className="text-xs font-medium text-gray-500">Offre épuisée</p>
            )}
            <p
              className={
                exhausted
                  ? 'text-lg font-bold tracking-tight text-gray-800 mt-0.5'
                  : 'text-lg font-bold tracking-tight text-gray-800'
              }
            >
              Membre Fondateur
            </p>
          </div>
          <div className="p-4 space-y-2">
            <p className="text-xs text-gray-600 leading-relaxed">
              6 mois offerts — réservée aux 500 premiers membres.
            </p>
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
              {exhausted
                ? 'Les 500 places ont été attribuées.'
                : lockedReason}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        aria-disabled="true"
        className="relative overflow-hidden rounded-3xl border-2 border-gray-200 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 opacity-60 grayscale pointer-events-none select-none"
      >
        <div className="relative p-5 sm:p-6 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-200/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-600 border border-gray-300/80">
            <Gift className="w-3.5 h-3.5" />
            {exhausted ? 'Offre épuisée' : 'Non disponible'}
          </span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight leading-tight">
              Membre Fondateur
            </h2>
            <p className="mt-2 text-sm sm:text-base font-medium text-gray-500 leading-snug">
              {exhausted
                ? 'Les 500 places ont été attribuées. L’offre Fondateur n’est plus disponible.'
                : lockedReason}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-400 via-amber-300 to-rose-300 shadow-lg shadow-amber-200/60">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 20%, rgba(255,255,255,0.85) 0%, transparent 45%), radial-gradient(circle at 88% 10%, rgba(255,255,255,0.55) 0%, transparent 40%)',
        }}
      />
      <div className="relative p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold tracking-wide text-amber-900 border border-white/80 shadow-sm">
            <Gift className="w-3.5 h-3.5" />
            {founderOfferBadgeLabel(status)}
          </span>
          {status.is_founder && (
            <FounderBadge number={status.founder_number} />
          )}
          {status.has_premium && <PremiumBadge />}
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-950 tracking-tight leading-tight">
            Membre Fondateur
          </h2>
          <p className="mt-2 text-base sm:text-lg font-semibold text-amber-950/90 leading-snug">
            {founderOfferSubtitle(status)}
          </p>
        </div>

        <ul className="space-y-2">
          <li className="flex items-start gap-2.5 text-sm sm:text-base font-medium text-amber-950">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/80">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            </span>
            Inscription sans carte bancaire — accès complet inclus
          </li>
        </ul>

        {showCta && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onActivate}
              disabled={activating}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm sm:text-base font-bold shadow-lg shadow-emerald-900/35 ring-2 ring-white/70 hover:bg-emerald-800 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {activating ? 'Activation…' : 'Rejoindre en Fondateur'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Carte principale quand Freemium est l’offre active (même poids visuel que Fondateur). */
function FreemiumActiveBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-cyan-200 bg-gradient-to-br from-sky-500 via-cyan-400 to-sky-200 shadow-lg shadow-cyan-200/50">
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            'radial-gradient(circle at 88% 14%, rgba(255,255,255,0.55) 0%, transparent 42%), radial-gradient(circle at 12% 80%, rgba(224,242,254,0.65) 0%, transparent 48%), radial-gradient(circle at 45% 35%, rgba(34,211,238,0.25) 0%, transparent 45%)',
        }}
      />
      <div className="relative p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-900 border border-white/80 shadow-sm">
            <Check className="w-3.5 h-3.5" />
            Offre active
          </span>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-sky-950 tracking-tight leading-tight">
            Offre Freemium
          </h2>
          <p className="mt-2 text-base sm:text-lg font-semibold text-sky-950/85 leading-snug">
            Gratuit — l’essentiel d’Aypik, sans engagement.
          </p>
        </div>

        <ul className="space-y-2">
          <li className="flex items-start gap-2.5 text-sm sm:text-base font-medium text-sky-950">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/85">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            </span>
            Sans carte bancaire
          </li>
          <li className="flex items-start gap-2.5 text-sm sm:text-base font-medium text-sky-950">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/85">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            </span>
            Profil, matching et messages inclus
          </li>
          <li className="flex items-start gap-2.5 text-sm sm:text-base font-medium text-sky-950">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/85">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            </span>
            Aucune reconduction ni prélèvement
          </li>
        </ul>
      </div>
    </div>
  );
}

function FreemiumClaimCard({
  onActivate,
  activating = false,
  primary = false,
  disabled = false,
  disabledReason = 'Inclus : vous bénéficiez déjà de l’offre Membre Fondateur',
}: {
  onActivate: () => void;
  activating?: boolean;
  primary?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={
        disabled
          ? 'rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden opacity-55 grayscale pointer-events-none select-none'
          : primary
            ? 'rounded-2xl border border-rose-200 bg-white overflow-hidden shadow-sm shadow-rose-50'
            : 'rounded-2xl border border-gray-200 bg-white overflow-hidden'
      }
    >
      <div
        className={
          disabled || !primary
            ? 'bg-gray-100 px-4 py-3 border-b border-gray-200'
            : 'bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 text-white'
        }
      >
        <p
          className={
            disabled
              ? 'text-xs font-medium uppercase tracking-wide text-gray-500'
              : primary
                ? 'text-xs font-medium uppercase tracking-wide text-white/90'
                : 'text-xs font-semibold uppercase tracking-wide text-gray-900'
          }
        >
          Offre Freemium
        </p>
        <p
          className={
            disabled || !primary
              ? 'text-lg font-bold tracking-tight text-gray-800 mt-0.5'
              : 'text-lg font-bold tracking-tight mt-0.5'
          }
        >
          Gratuit
        </p>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          Accès à l’essentiel d’Aypik, sans engagement ni carte bancaire.
        </p>
        {disabled ? (
          <>
            <p className="text-xs font-medium text-gray-700 leading-relaxed bg-white/70 border border-gray-200 rounded-xl px-3 py-2">
              {disabledReason}
            </p>
            <div
              role="presentation"
              aria-hidden="true"
              className="w-full py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-sm font-semibold text-center cursor-not-allowed"
            >
              Offre Freemium
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onActivate}
            disabled={activating}
            className={
              primary
                ? 'w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-sm font-semibold shadow-sm shadow-sky-100 hover:opacity-95 transition-opacity disabled:opacity-60'
                : 'w-full py-2.5 rounded-xl border border-sky-300 bg-sky-50 text-sky-800 text-sm font-semibold hover:bg-sky-100 transition-colors disabled:opacity-60'
            }
          >
            {activating ? 'Activation…' : 'Continuer en Freemium'}
          </button>
        )}
      </div>
    </div>
  );
}

function PostFounderChoicePanel() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white border border-emerald-100 flex items-center justify-center flex-shrink-0">
          <Heart className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-emerald-950">
            {AFTER_FOUNDER_TITLE}
          </p>
          <p className="text-xs text-emerald-900/90 leading-snug">
            {AFTER_FOUNDER_PERIOD_COPY}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MembershipPanel({
  status,
  onPurchaseBoost,
  onRefresh,
  onClaimFounder,
  onClaimFreemium,
  claimingOffer = false,
  /** Tunnel inscription : choix d’offre obligatoire avant le profil */
  signupGate = false,
  /** Si fourni, prime sur status.membership_linked (déblocage immédiat après claim). */
  offerSelected,
  /** Après paiement Premium / Boost réussi (ex. passer à l’étape profil). */
  onPaidOfferSuccess,
}: {
  status: MembershipStatus;
  /** Boost gratuit Fondateur ou filet local (`purchase_boost`). */
  onPurchaseBoost?: () => Promise<string | null>;
  onRefresh?: () => void;
  onClaimFounder?: () => void;
  onClaimFreemium?: () => void;
  claimingOffer?: boolean;
  signupGate?: boolean;
  offerSelected?: boolean;
  onPaidOfferSuccess?: () => void;
}) {
  const [canceling, setCanceling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [boostActivating, setBoostActivating] = useState(false);
  const daysLeft = daysUntil(status.founder_premium_until);
  const priceLabel = formatPremiumPriceLabel(
    status.premium_price_cents,
    status.premium_currency,
    status.premium_interval
  );
  const periodActive = isFounderPeriodActive(status);
  const founderAvailable = isFounderAvailable(status);
  const offerChosen =
    typeof offerSelected === 'boolean'
      ? offerSelected
      : status.membership_linked;
  /** Bénéficie déjà de l’offre Fondateur (période 6 mois en cours). */
  const onFounderBenefits =
    isFounderComplimentaryAccess(status) ||
    (periodActive && status.is_founder);
  /**
   * Offre Freemium active : offre liée, hors Fondateur / Premium.
   * Détection large pour éviter qu’une carte Fondateur colorée réapparaisse.
   */
  const onFreemium =
    offerChosen &&
    !status.is_founder &&
    !periodActive &&
    status.plan !== 'premium' &&
    status.plan !== 'founder';

  const showFounderHero =
    !onFreemium && (founderAvailable || status.is_founder);
  const showFounderExhausted =
    signupGate && !founderAvailable && !status.is_founder && !onFreemium;
  const showFounderCta =
    signupGate &&
    !offerChosen &&
    founderAvailable &&
    !onFreemium &&
    Boolean(onClaimFounder);
  /** Fondateur en secondaire grisé quand Freemium est l’offre active. */
  const showFounderSecondaryLocked = onFreemium;

  const founderExpiringSoon =
    periodActive && daysLeft !== null && daysLeft <= 14 && daysLeft > 0;

  const founderExpired =
    status.is_founder && !periodActive && !status.has_premium;

  const canCancelPaid =
    status.has_premium && !periodActive && status.plan === 'premium';

  const premiumLockedByFounder =
    (founderAvailable && !offerChosen) || onFounderBenefits;
  /** Freemium active → Premium grisé / non interactif. */
  const premiumLockedByFreemium = onFreemium;
  const premiumDisabled = premiumLockedByFounder || premiumLockedByFreemium;
  const showPaidPremiumActive =
    status.has_premium &&
    !periodActive &&
    !premiumLockedByFounder &&
    status.plan === 'premium';
  const showPremiumOffer =
    !showPaidPremiumActive &&
    (onFreemium ||
      premiumDisabled ||
      !status.has_premium ||
      founderExpired);
  const premiumTone =
    (!founderAvailable && !onFreemium) || founderExpired
      ? 'primary'
      : 'secondary';
  const premiumDisabledReason = onFounderBenefits
    ? 'Inclus — offre Fondateur à 0 € (accès Premium déjà validé, sans paiement)'
    : premiumLockedByFreemium
      ? FREEMIUM_ACTIVE_UNSELECTED_LABEL
      : undefined;

  /** Pendant la période Fondateur : Freemium visible mais non sélectionnable. */
  const showFreemiumLocked = onFounderBenefits;
  /**
   * Paiements opérationnels (ENABLE_PAYMENTS) : Fondateurs = Premium auto-validé
   * à 0 € + Boost offert via purchase_boost (sans Stripe).
   */
  const showBoost = ENABLE_PAYMENTS;
  const boostPurchaseDisabled = onFreemium && !status.has_boost;
  const boostDisabledReason = FREEMIUM_ACTIVE_UNSELECTED_LABEL;
  const showPremiumOfferCard = showPremiumOffer && ENABLE_PAYMENTS;

  const handleComplimentaryBoost = async () => {
    if (!onPurchaseBoost) return 'Activation Boost indisponible.';
    setBoostActivating(true);
    const err = await onPurchaseBoost();
    setBoostActivating(false);
    if (!err) onRefresh?.();
    return err;
  };

  const handleCancel = async () => {
    if (
      !window.confirm(
        'Résilier Premium ? Aucune reconduction forcée : vous ne serez plus prélevé. Aucun frais de résiliation. L’accès reste actif jusqu’à la fin de la période déjà payée, puis vous pourrez rester en Freemium, choisir une autre offre, ou interrompre votre adhésion.'
      )
    ) {
      return;
    }
    setCanceling(true);
    setCancelMsg(null);
    const err = await cancelPremiumSubscription();
    setCanceling(false);
    if (err) {
      setCancelMsg(err);
      return;
    }
    setCancelMsg('Résiliation enregistrée.');
    onRefresh?.();
  };

  const handlePaidSuccess = () => {
    onRefresh?.();
    onPaidOfferSuccess?.();
  };

  if (signupGate && !offerChosen) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-100 bg-white/80 p-4 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-600 mb-2">
            <Gift className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            Offre Fondateur
          </h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {founderAvailable
              ? 'Rejoignez les 500 premiers membres — accès complet à 0 €.'
              : 'Les places Fondateur sont épuisées pour le moment.'}
          </p>
        </div>

        {showFounderHero && (
          <FounderActiveBanner
            status={status}
            onActivate={showFounderCta ? onClaimFounder : undefined}
            activating={claimingOffer}
          />
        )}

        {showFounderExhausted && (
          <FounderActiveBanner status={status} exhausted />
        )}
      </div>
    );
  }

  // Tunnel inscription : offre Fondateur déjà choisie — vue courte.
  if (signupGate && offerChosen) {
    return (
      <div className="space-y-4">
        <FounderActiveBanner status={status} onActivate={undefined} />
        <p className="text-sm text-center text-gray-600 leading-relaxed px-1">
          Offre Fondateur active. Utilisez le bouton ci-dessous pour continuer
          vers votre profil.
        </p>
      </div>
    );
  }

  // Après choix d’offre en inscription : visualiser l’offre active
  // (Freemium coloré, autres grisés). Le CTA d’étape est dans ProfileSetup.
  // (pas de return anticipé ici)

  return (
    <div className="space-y-4">
      {onFreemium && <FreemiumActiveBanner />}

      {showFounderHero && (
        <FounderActiveBanner status={status} onActivate={undefined} />
      )}

      {founderExpiringSoon && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Bell className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {AFTER_FOUNDER_TITLE}
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-snug">
              Dans {daysLeft} jour{daysLeft! > 1 ? 's' : ''} —{' '}
              {AFTER_FOUNDER_PERIOD_COPY}
            </p>
          </div>
        </div>
      )}

      {founderExpired && <PostFounderChoicePanel />}

      <div className="space-y-3 pt-1">
        <p className="text-sm font-bold uppercase tracking-wide text-gray-800 px-0.5">
          {onFreemium ? 'Autres options' : 'Offres'}
        </p>

        {showFounderSecondaryLocked && (
          <FounderActiveBanner
            status={status}
            locked
            compact
            lockedReason={FREEMIUM_ACTIVE_UNSELECTED_LABEL}
          />
        )}

        {showPremiumOfferCard && (
          <PremiumConversionCard
            status={status}
            founderExpired={founderExpired}
            onPaymentSuccess={handlePaidSuccess}
            tone={premiumTone}
            disabled={premiumDisabled || onFreemium}
            disabledReason={
              onFreemium
                ? FREEMIUM_ACTIVE_UNSELECTED_LABEL
                : premiumDisabledReason
            }
          />
        )}

        {showFreemiumLocked && (
          <FreemiumClaimCard
            onActivate={() => undefined}
            disabled
          />
        )}

        {showPaidPremiumActive && (
          <SoftPremiumBanner
            title="Abonnement Premium actif"
            description="Qui vous a liké, filtres avancés et likes illimités sont inclus. Sans engagement : résiliable à tout moment, sans reconduction forcée."
            priceLabel={priceLabel}
          />
        )}

        {canCancelPaid && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-900">
              Gérer l’abonnement
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Résiliation en un clic, sans frais ni parcours compliqué. Aucune
              reconduction forcée : vous conservez Premium jusqu’à la fin de la
              période déjà payée, puis vous pouvez rester en Freemium, choisir
              une autre offre, ou interrompre votre adhésion.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              disabled={canceling}
              className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
            >
              {canceling ? 'Résiliation…' : 'Résilier Premium'}
            </button>
            {cancelMsg && (
              <p className="text-xs text-center text-gray-600">{cancelMsg}</p>
            )}
          </div>
        )}

        {status.is_founder && !periodActive && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3 flex items-start gap-2">
            <Award className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              Badge Membre Fondateur
              {typeof status.founder_number === 'number'
                ? ` #${status.founder_number}`
                : ''}{' '}
              — visible sur votre profil.
            </p>
          </div>
        )}

        {showBoost && (
          <BoostPurchaseCard
            status={status}
            hasBoost={status.has_boost}
            boostEndsAt={status.boost_ends_at}
            purchaseDisabled={boostPurchaseDisabled}
            purchaseDisabledReason={boostDisabledReason}
            onPaymentSuccess={handlePaidSuccess}
            onComplimentaryActivate={
              onFounderBenefits ? handleComplimentaryBoost : undefined
            }
            complimentaryActivating={boostActivating}
          />
        )}
      </div>
    </div>
  );
}
