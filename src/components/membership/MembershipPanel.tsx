import { Award, Bell, Check, Gift, Heart } from 'lucide-react';
import { useState } from 'react';
import { FounderBadge, PremiumBadge } from '@/components/membership/Badges';
import { BoostPurchaseCard } from '@/components/membership/BoostPurchaseCard';
import { SoftPremiumBanner } from '@/components/membership/SoftPremium';
import { PremiumConversionCard } from '@/components/membership/PremiumConversionCard';
import { cancelPremiumSubscription } from '@/lib/payments';
import {
  daysUntil,
  formatPremiumPriceLabel,
  isFounderAvailable,
  AFTER_FOUNDER_TITLE,
  AFTER_FOUNDER_PERIOD_COPY,
  type MembershipStatus,
} from '@/lib/membership';

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
              Les 500 places ont été attribuées. Choisissez l’offre Freemium ou
              Premium pour continuer.
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

        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-950 tracking-tight leading-tight">
            Membre Fondateur
          </h2>
          <p className="mt-2 text-base sm:text-lg font-semibold text-amber-950/90 leading-snug">
            6 mois offerts — Offre exclusive réservée aux 500 premiers membres.
          </p>
        </div>

        <ul className="space-y-2">
          <li className="flex items-start gap-2.5 text-sm sm:text-base font-medium text-amber-950">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/80">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            </span>
            Inscription sans carte bancaire
          </li>
        </ul>

        <div className="rounded-2xl bg-white/75 border border-white/90 px-4 py-3.5 space-y-1.5">
          <p className="text-sm sm:text-base font-bold text-amber-950 tracking-tight">
            {AFTER_FOUNDER_TITLE}
          </p>
          <p className="text-sm font-medium text-amber-950/85 leading-relaxed">
            {AFTER_FOUNDER_PERIOD_COPY}
          </p>
        </div>

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

const PAID_PREMIUM_LINE =
  "Premium à 19,99 € / mois pour un confort d'utilisation, sans engagement.";

function PostFounderChoicePanel() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white border border-emerald-100 flex items-center justify-center flex-shrink-0">
          <Heart className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold text-emerald-950">
            {AFTER_FOUNDER_TITLE}
          </p>
          <p className="text-xs text-emerald-900/90 leading-relaxed">
            {AFTER_FOUNDER_PERIOD_COPY}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        <li className="rounded-xl border border-white/80 bg-white/80 px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-900">
            Interrompre votre adhésion
          </p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            Aucun prélèvement ne démarre. Vous pouvez quitter quand vous voulez,
            sans frais ni parcours forcé.
          </p>
        </li>
        <li className="rounded-xl border border-white/80 bg-white/80 px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-900">
            Migrer vers Freemium
          </p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            Par défaut après l’échéance : accès à l’essentiel, gratuit et sans
            engagement.
          </p>
        </li>
        <li className="rounded-xl border border-white/80 bg-white/80 px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-900">
            Passer à Premium
          </p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            Option volontaire uniquement — {PAID_PREMIUM_LINE}
          </p>
        </li>
      </ul>
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

  const showFounderActive = founderAvailable || status.is_founder;
  const showFounderExhausted =
    signupGate && !founderAvailable && !status.is_founder;
  const showFounderCta =
    signupGate && !offerChosen && founderAvailable && Boolean(onClaimFounder);

  const founderExpiringSoon =
    periodActive && daysLeft !== null && daysLeft <= 14 && daysLeft > 0;

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
    signupGate && !offerChosen && Boolean(onClaimFreemium);

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

  if (signupGate && !offerChosen) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-100 bg-white/80 p-4 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-500 mb-2">
            <Heart className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            Choisissez votre offre
          </h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Une offre doit être validée avant de créer votre profil.
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
          <FounderActiveBanner status={status} exhausted />
        )}

        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-800 px-0.5">
            {founderAvailable ? 'Autres options' : 'Offres disponibles'}
          </p>

          {showPremiumOffer && (
            <PremiumConversionCard
              status={status}
              founderExpired={founderExpired}
              onPaymentSuccess={onRefresh}
              tone={premiumTone}
              disabled={premiumLockedByFounder}
            />
          )}

          {showFreemiumClaim && (
            <FreemiumClaimCard
              onActivate={onClaimFreemium!}
              activating={claimingOffer}
              primary={!founderAvailable}
            />
          )}
        </div>
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
              {status.is_founder
                ? 'Membre Fondateur'
                : status.plan === 'premium'
                  ? 'Premium'
                  : 'Freemium'}
            </strong>
            . Vous pouvez maintenant compléter votre profil.
          </p>
        </div>
      )}

      {showFounderActive && <FounderActiveBanner status={status} />}

      {founderExpiringSoon && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Bell className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {AFTER_FOUNDER_TITLE}
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Dans {daysLeft} jour{daysLeft! > 1 ? 's' : ''}, vos mois offerts
              se terminent. {AFTER_FOUNDER_PERIOD_COPY}
            </p>
          </div>
        </div>
      )}

      {founderExpired && <PostFounderChoicePanel />}

      <div className="space-y-3 pt-1">
        {!signupGate && (
          <p className="text-sm font-bold uppercase tracking-wide text-gray-800 px-0.5">
            Offres
          </p>
        )}

        {showPremiumOffer && !signupGate && (
          <PremiumConversionCard
            status={status}
            founderExpired={founderExpired}
            onPaymentSuccess={onRefresh}
            tone={premiumTone}
            disabled={false}
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

        {!signupGate && (
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
