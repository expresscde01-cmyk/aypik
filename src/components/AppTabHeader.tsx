import type { ReactNode } from 'react';
import HomeBackButton from '@/components/HomeBackButton';
import NotificationsBell from '@/components/NotificationsBell';
import { AccountStatusBadges } from '@/components/AccountStatusBadge';
import OwnerBoostIndicator from '@/components/membership/OwnerBoostIndicator';
import type { AccountStatusId } from '@/lib/accountStatus';
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
};

/** Header sticky Accueil + notifications, partagé par les onglets de l’app. */
export default function AppTabHeader({
  onHome,
  onOpenInbox,
  notificationsActive,
  children,
  variant = 'page',
  accountStatuses = [],
  onAccountStatusClick,
}: AppTabHeaderProps) {
  const navRow = (
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

  if (variant === 'discover') {
    return (
      <header className="sticky top-0 z-30 discover-sticky-header">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 sm:pt-4 sm:pb-2.5">
          {navRow}
          {children}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
        <div className="w-full">{navRow}</div>
      </div>
    </header>
  );
}
