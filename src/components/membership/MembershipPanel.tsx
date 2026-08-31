import { Award, Bell, Check, Gift, Heart, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { FounderBadge, PremiumBadge } from '@/components/membership/Badges';
import { BoostPurchaseCard } from '@/components/membership/BoostPurchaseCard';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { PremiumConversionCard } from '@/components/membership/PremiumConversionCard';
import { cancelPremiumSubscription } from '@/lib/payments';
import {
  FOUNDER_AFTER_6_MONTHS_BODY,
  FOUNDER_BENEFIT_BOOST_FIRST_MONTH,
  FOUNDER_BENEFIT_NO_CARD,
  FOUNDER_BENEFIT_UNLIMITED_LIKES,
  FOUNDER_MAX_SLOTS,
  FOUNDER_SLOTS_SUBTITLE,
  SITE_FREE_MODE,
  isFounderOffer,
  offerShortName,
} from '@/lib/founderCopy';
import {
  daysUntil,
  formatPremiumPriceLabel,
  isFounderAvailable,
  isFounderPeriodActive,
  type MembershipStatus,
} from '@/lib/membership';

function FounderActiveBanner({
  status,
  onActivate,
  activating = false,
  exhausted = false,
}: {
  status: MembershipStatus;
  onActivate?: () => void;
  activating?: boolean;
  exhausted?: boolean;
}) {
  const showCta = !exhausted && Boolean(onActivate);

  if (exhausted) {
    return (
      <div
        aria-disabled="true"
        className="relative overflow-hidden rounded-3xl border-2 border-gray-200 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 opacity-60 grayscale"
      >
        <div className="relative p-5 sm:p-6 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-200/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-600 border border-gray-300/80">
            <Gift className="w-3.5 h-3.5" />
            Offre épuisée
          </span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight leading-tight">
              Membre Fondateur
            </h2>
            <p className="mt-2 text-sm sm:text-base font-medium text-gray-500 leading-snug">
              Les {FOUNDER_MAX_SLOTS} places ont été attribuées
              {SITE_FREE_MODE
                ? '.'
                : '. Choisis l’offre Freemium ou Premium pour continuer.'}
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 border border-white/80 shadow-sm">
            <Gift className="w-3.5 h-3.5" />
            Offre limitée
          </span>
          {status.is_founder && (
            <FounderBadge number={status.founder_number} />
          )}
          {status.has_premium && <PremiumBadge />}
        </div>
        {status.has_premium ? (
          <p className="text-xs font-medium text-amber-950/80 leading-snug">
            Premium : tes avantages Fondateur pendant 6 mois, dont le Boost offert le 1er mois.
          </p>
        ) : null}

        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-950 tracking-tight leading-tight">
            Membre Fondateur
          </h2>
          <p className="mt-2 text-base sm:text-lg font-semibold text-amber-950/90 leading-snug">
            {FOUNDER_SLOTS_SUBTITLE}
          </p>
        </div>

        <ul className="space-y-2">
          {[
            FOUNDER_BENEFIT_NO_CARD,
            FOUNDER_BENEFIT_UNLIMITED_LIKES,
            FOUNDER_BENEFIT_BOOST_FIRST_MONTH,
          ].map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 text-sm sm:text-base font-medium text-amber-950"
            >
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/80">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              </span>
              {item}
            </li>
          ))}
        </ul>

        {showCta && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onActivate}
              disabled={activating}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-700 text-white text-sm sm:text-base font-bold shadow-lg shadow-emerald-900/35 ring-2 ring-white/70 hover:bg-emerald-800 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {activating ? 'Activation…' : 'Activer mon offre Fondateur'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FreemiumClaimCard({
  onActivate,
  activating = false,
  primary = false,
}: {
  onActivate: () => void;
  activating?: boolean;
  primary?: boolean;
}) {
  return (
    <div
      className={
        primary
          ? 'rounded-2xl border border-rose-200 bg-white overflow-hidden shadow-sm shadow-rose-50'
          : 'rounded-2xl border border-gray-200 bg-white overflow-hidden'
      }
    >
      <div
        className={
          primary
            ? 'bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 text-white'
            : 'bg-gray-100 px-4 py-3 border-b border-gray-200'
        }
      >
        <p
          className={
            primary
              ? 'text-xs font-medium text-white/90'
              : 'text-xs font-medium text-gray-500'
          }
        >
          Offre Freemium
        </p>
        <p
          className={
            primary
              ? 'text-lg font-bold tracking-tight mt-0.5'
              : 'text-lg font-bold tracking-tight text-gray-800 mt-0.5'
          }
        >
          Gratuit
        </p>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          Accès à l’essentiel d’Aypik, sans engagement ni carte bancaire.
        </p>
        <button
          type="button"
          onClick={onActivate}
          disabled={activating}
          className={
            primary
              ? 'w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-60'
              : 'w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60'
          }
        >
          {activating ? 'Activation…' : 'Continuer en Freemium'}
        </button>
      </div>
    </div>
  );
}

function OptionalPremiumNote({ months }: { months: number }) {
  if (SITE_FREE_MODE) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-gray-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-700">
            Après tes {months} mois offerts
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {FOUNDER_AFTER_6_MONTHS_BODY}
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
}: {
  status: MembershipStatus;
  onPurchaseBoost: () => Promise<string | null>;
  onRefresh?: () => void;
  onClaimFounder?: () => void;
  onClaimFreemium?: () => void;
  claimingOffer?: boolean;
  signupGate?: boolean;
}) {
  const [canceling, setCanceling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const daysLeft = daysUntil(status.founder_premium_until);
  const priceLabel = formatPremiumPriceLabel(
    status.premium_price_cents,
    status.premium_currency,
    status.premium_interval
  );
  const periodActive = isFounderPeriodActive(status);
  const founderAvailable = isFounderAvailable(status);
  const offerChosen = status.membership_linked;

  const showFounderActive =
    (founderAvailable && !status.is_founder) ||
    (status.is_founder && periodActive);
  const showFounderExhausted =
    signupGate && !founderAvailable && !status.is_founder;
  const showFounderCta =
    signupGate &&
    !offerChosen &&
    founderAvailable &&
    Boolean(onClaimFounder);

  const founderExpiringSoon =
    periodActive &&
    daysLeft !== null &&
    daysLeft <= 14 &&
    daysLeft > 0;

  const founderExpired =
    status.is_founder && !periodActive && !status.has_premium;

  const canCancelPaid =
    status.has_premium && !periodActive && status.plan === 'premium';

  const premiumLockedByFounder = founderAvailable && !offerChosen;
  const showPaidPremiumActive =
    status.has_premium && !periodActive && !premiumLockedByFounder;
  const showPremiumOffer =
    !showPaidPremiumActive &&
    (premiumLockedByFounder || !status.has_premium || founderExpired);
  const premiumTone =
    !founderAvailable || founderExpired ? 'primary' : 'secondary';

  const showFreemiumClaim =
    signupGate &&
    !offerChosen &&
    !founderAvailable &&
    Boolean(onClaimFreemium);

  const handleCancel = async () => {
    if (
      !window.confirm(
        'Résilier Premium ? Tu ne seras plus prélevé. Aucun frais de résiliation. L’accès reste actif jusqu’à la fin de la période déjà payée.'
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

  if (signupGate && !offerChosen) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-100 bg-white/80 p-4 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-500 mb-2">
            <Heart className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            Ta formule
          </h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            6 mois offerts, sans carte bancaire. Active l’offre Fondateur
            pour créer ton profil.
          </p>
        </div>

        {showFounderActive && (
          <FounderActiveBanner
            status={status}
            onActivate={showFounderCta ? onClaimFounder : undefined}
            activating={claimingOffer}
          />
        )}

        {showFounderExhausted && (
          <>
            <FounderActiveBanner status={status} exhausted />
            {showFreemiumClaim && (
              <FreemiumClaimCard
                onActivate={onClaimFreemium!}
                activating={claimingOffer}
                primary
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {signupGate && offerChosen && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-900 leading-relaxed">
            Offre activée :{' '}
            <strong>
              {isFounderOffer(status)
                ? 'Membre Fondateur'
                : offerShortName(status)}
            </strong>
            . Tu peux maintenant compléter ton profil.
          </p>
        </div>
      )}

      {showFounderActive && (
        <FounderActiveBanner
          status={status}
          activating={false}
        />
      )}

      {!SITE_FREE_MODE && founderExpiringSoon && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Bell className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Ta période Fondateur touche à sa fin
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Dans {daysLeft} jour{daysLeft! > 1 ? 's' : ''}, tes{' '}
              {status.founder_premium_months} mois à 0 € se terminent. Tu
              pourras rester en freemium, ou reconduire en soutien à{' '}
              <strong>{priceLabel}</strong>.
            </p>
          </div>
        </div>
      )}

      {!SITE_FREE_MODE && periodActive && (
        <OptionalPremiumNote months={status.founder_premium_months} />
      )}

      <div className="space-y-3 pt-1">
        {!signupGate && !SITE_FREE_MODE && (
          <p className="text-sm font-bold uppercase tracking-wide text-gray-800 px-0.5">
            Offres
          </p>
        )}

        {!SITE_FREE_MODE && showPremiumOffer && !signupGate && (
          <PremiumConversionCard
            status={status}
            founderExpired={founderExpired}
            onPaymentSuccess={onRefresh}
            tone={premiumTone}
            disabled={false}
          />
        )}

        {showPaidPremiumActive && !SITE_FREE_MODE && (
          <SoftPremiumBanner
            title="Abonnement Premium actif"
            description="Qui t'a liké, filtres avancés et likes illimités sont inclus."
            priceLabel={SITE_FREE_MODE ? undefined : priceLabel}
          />
        )}

        {canCancelPaid && !SITE_FREE_MODE && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-900">
              Gérer l’abonnement
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Résiliation en un clic, sans frais ni parcours compliqué. Tu
              conserves Premium jusqu’à la fin de la période déjà payée.
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
              — visible sur ton profil.
            </p>
          </div>
        )}

        {!signupGate &&
          !SITE_FREE_MODE &&
          !periodActive &&
          status.plan !== 'founder' && (
          <BoostPurchaseCard
            hasBoost={status.has_boost}
            boostEndsAt={status.boost_ends_at}
            onPurchase={onPurchaseBoost}
          />
        )}
      </div>
    </div>
  );
}
