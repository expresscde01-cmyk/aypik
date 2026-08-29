import type { ReactNode } from 'react';
import HomeBackButton from '@/components/HomeBackButton';
import NotificationsBell from '@/components/NotificationsBell';
import type { OpenMatchesOpts } from '@/lib/matchesNav';

type AppTabHeaderProps = {
  onHome: () => void;
  onOpenInbox?: (actorId?: string | null, opts?: OpenMatchesOpts) => void;
  notificationsActive: boolean;
  /** Titre centré (Mes Matchs). */
  center?: ReactNode;
  /** Contenu sous la rangée Accueil / cloche (intro Découvrir). */
  children?: ReactNode;
  variant?: 'page' | 'discover';
};

/** Header sticky Accueil + notifications, partagé par les onglets de l’app. */
export default function AppTabHeader({
  onHome,
  onOpenInbox,
  notificationsActive,
  center,
  children,
  variant = 'page',
}: AppTabHeaderProps) {
  if (variant === 'discover') {
    return (
      <header className="sticky top-0 z-30 discover-sticky-header">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 sm:pt-4 sm:pb-2.5">
          <div className="flex items-center justify-between gap-3">
            <HomeBackButton onClick={onHome} />
            <div className="shrink-0 -mr-1">
              <NotificationsBell
                onOpenInbox={onOpenInbox}
                active={notificationsActive}
              />
            </div>
          </div>
          {children}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <HomeBackButton onClick={onHome} />
        {center}
        <NotificationsBell
          onOpenInbox={onOpenInbox}
          active={notificationsActive}
        />
      </div>
    </header>
  );
}
