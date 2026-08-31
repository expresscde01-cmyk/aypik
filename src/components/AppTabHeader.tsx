import { useEffect, useState, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import HomeBackButton from '@/components/HomeBackButton';
import NotificationsBell from '@/components/NotificationsBell';
import AccountMenu from '@/components/AccountMenu';
import { AccountStatusBadges } from '@/components/AccountStatusBadge';
import OwnerBoostIndicator from '@/components/membership/OwnerBoostIndicator';
import { BrandLockup, BrandMark } from '@/components/BrandLockup';
import { useAuth } from '@/lib/auth';
import {
  HeaderTaglineWidthProbe,
  useHeaderTaglineCompact,
} from '@/lib/useHeaderTaglineCompact';
import {
  resolveVisibilityChoice,
  type AccountStatusId,
  type VisibilityChoice,
} from '@/lib/accountStatus';
import type { OpenMatchesOpts } from '@/lib/matchesNav';

type AppTabHeaderProps = {
  onHome: () => void;
  onOpenInbox?: (actorId?: string | null, opts?: OpenMatchesOpts) => void;
  notificationsActive: boolean;
  /** Contenu sous la rangée Accueil / cloche (intro Découvrir). */
  children?: ReactNode;
  variant?: 'page' | 'discover';
  accountStatuses?: AccountStatusId[];
  onAccountStatusClick?: (id: AccountStatusId) => void;
  /**
   * Rangée desktop (≥1024px), identique au header PC d’Accueil : logo,
   * cloche, menu compte et Déconnexion. Optionnels pour rester compatibles
   * avec un appelant qui ne fournirait pas encore ces infos.
   */
  displayName?: string;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
  onOpenPassword?: () => void;
  onOpenNotifications?: () => void;
  paused?: boolean;
  visibilityUi?: 'deactivated' | 'incognito' | null;
  onVisibilityChange?: (choice: VisibilityChoice) => Promise<string | null>;
  accountMenuRequestKey?: number;
};

/** Même bascule que le header PC d’Accueil (HomeDashboard). */
function usePcHeader() {
  const [pcHeader, setPcHeader] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setPcHeader(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return pcHeader;
}

/** Header sticky Accueil + notifications, partagé par les onglets de l’app. */
export default function AppTabHeader({
  onHome,
  onOpenInbox,
  notificationsActive,
  children,
  variant = 'page',
  accountStatuses = [],
  onAccountStatusClick,
  displayName = '',
  onSignOut,
  onOpenProfile,
  onOpenPassword,
  onOpenNotifications,
  paused = false,
  visibilityUi = null,
  onVisibilityChange,
  accountMenuRequestKey = 0,
}: AppTabHeaderProps) {
  const { user } = useAuth();
  const pcHeader = usePcHeader();
  const { compact: taglineCompact, rowRef, rightRef, probeRef } =
    useHeaderTaglineCompact();

  const accountMenu =
    onSignOut &&
    user?.id &&
    onOpenProfile &&
    onOpenPassword &&
    onOpenNotifications ? (
      <AccountMenu
        displayName={displayName}
        visibilityChoice={resolveVisibilityChoice({
          paused,
          deactivated: !paused && visibilityUi === 'deactivated',
          incognito: !paused && visibilityUi === 'incognito',
        })}
        onVisibilityChange={onVisibilityChange ?? (async () => null)}
        openRequestKey={accountMenuRequestKey}
        onOpenProfile={onOpenProfile}
        onOpenPassword={onOpenPassword}
        onOpenNotifications={onOpenNotifications}
        onSignOut={onSignOut}
      />
    ) : null;

  /** Rangée mobile — inchangée. */
  const mobileRow = (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <HomeBackButton onClick={onHome} />
      <div className="flex items-center justify-center gap-2 min-w-0">
        <OwnerBoostIndicator />
        <AccountStatusBadges
          statuses={accountStatuses}
          onSelect={onAccountStatusClick}
        />
      </div>
      <div className="shrink-0 justify-self-end">
        <NotificationsBell
          onOpenInbox={onOpenInbox}
          active={notificationsActive}
        />
      </div>
    </div>
  );

  /** Rangée PC — identique au header PC d’Accueil. */
  const desktopRow = (
    <div
      ref={rowRef}
      className="relative flex w-full items-center justify-between gap-3 h-14"
    >
      <button
        type="button"
        onClick={onHome}
        className="flex items-center gap-2 min-w-0 shrink-0"
        aria-label="Retour à l’accueil"
      >
        <BrandMark size="sm" />
        <BrandLockup compact={taglineCompact} />
      </button>
      <div ref={rightRef} className="flex items-center gap-1 shrink-0 ml-auto">
        <NotificationsBell
          onOpenInbox={onOpenInbox}
          active={notificationsActive}
        />
        {accountMenu}
        <OwnerBoostIndicator />
        <AccountStatusBadges
          statuses={accountStatuses}
          onSelect={onAccountStatusClick}
        />
        {onSignOut && (
          <>
            <span
              className="hidden lg:block w-px h-4 bg-gray-200 mx-1.5 shrink-0"
              aria-hidden
            />
            <button
              type="button"
              onClick={onSignOut}
              className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              Déconnexion
            </button>
          </>
        )}
      </div>
      <HeaderTaglineWidthProbe probeRef={probeRef} />
    </div>
  );

  const navRow = pcHeader ? desktopRow : mobileRow;

  if (variant === 'discover') {
    return (
      <header className="sticky top-0 z-30 discover-sticky-header">
        {pcHeader ? (
          <div className="w-full px-8">
            <div className="max-w-7xl mx-auto h-14 flex items-center">
              {desktopRow}
            </div>
            <div className="max-w-2xl mx-auto pb-2 sm:pb-2.5">{children}</div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 sm:pt-4 sm:pb-2.5">
            {navRow}
            {children}
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className={pcHeader ? 'w-full px-8' : 'max-w-2xl mx-auto px-4 h-14 flex items-center'}>
        <div className={pcHeader ? 'max-w-7xl mx-auto' : 'w-full'}>{navRow}</div>
      </div>
    </header>
  );
}
