import { useState, useEffect } from 'react';
import { Compass, Heart, Home, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { cancelAccountDeletion } from '@/lib/deleteAccount';
import { userErrorMessage } from '@/lib/userError';
import MatchesPage from '@/components/MatchesPage';
import ProfileSetup from '@/components/ProfileSetup';
import DiscoveryPage from '@/components/DiscoveryPage';
import HomeDashboard from '@/components/HomeDashboard';
import NotificationsBell from '@/components/NotificationsBell';
import type { Profile } from '@/components/ProfileSetup';

type Tab = 'home' | 'discover' | 'matches' | 'profile';

function initialTabFromQuery(): Tab {
  if (typeof window === 'undefined') return 'home';
  const open = new URLSearchParams(window.location.search).get('open');
  if (open === 'preferences' || open === 'profile') return 'profile';
  return 'home';
}

export default function AppShell() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTabFromQuery);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [cancelingDeletion, setCancelingDeletion] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (active) {
        setProfile(data as Profile | null);
        setProfileLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const needsProfile = !profileLoading && !profile;
  const displayName =
    profile?.display_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Membre';
  const deletionPending = Boolean(profile?.deletion_requested_at);

  const handleCancelDeletion = async () => {
    setCancelError(null);
    setCancelingDeletion(true);
    try {
      const err = await cancelAccountDeletion();
      if (err) throw new Error(err);
      setProfile((prev) =>
        prev ? { ...prev, deletion_requested_at: null } : prev
      );
    } catch (err) {
      setCancelError(userErrorMessage(err));
    } finally {
      setCancelingDeletion(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
      </div>
    );
  }

  if (needsProfile) {
    return (
      <ProfileSetup
        onDone={async () => {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user!.id)
            .maybeSingle();
          setProfile(data as Profile);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {deletionPending && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-2xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 text-sm text-amber-900">
              Compte en cours de suppression — reconnecte-toi dans les 30
              jours pour annuler.
            </p>
            <button
              type="button"
              onClick={() => void handleCancelDeletion()}
              disabled={cancelingDeletion}
              className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60"
            >
              {cancelingDeletion
                ? 'Annulation...'
                : 'Annuler la suppression'}
            </button>
          </div>
          {cancelError && (
            <p className="max-w-2xl mx-auto px-4 pb-3 text-sm text-red-700">
              {cancelError}
            </p>
          )}
        </div>
      )}
      <main className="flex-1 min-h-0">
        {tab === 'home' && (
          <HomeDashboard
            displayName={displayName}
            onSignOut={signOut}
            onOpenDiscover={() => setTab('discover')}
            onOpenMatches={() => setTab('matches')}
            onOpenProfile={() => setTab('profile')}
          />
        )}
        {tab === 'discover' && (
          <div className="min-h-full flex flex-col">
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
              <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setTab('home')}
                  className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                >
                  ← Accueil
                </button>
                <span className="text-sm font-semibold text-gray-800 truncate">
                  Découvrir
                </span>
                <NotificationsBell />
              </div>
            </div>
            <DiscoveryPage />
          </div>
        )}
        {tab === 'matches' && (
          <div className="min-h-full flex flex-col">
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
              <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setTab('home')}
                  className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                >
                  ← Accueil
                </button>
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {displayName}
                </span>
                <NotificationsBell />
              </div>
            </div>
            <MatchesPage />
          </div>
        )}
        {tab === 'profile' && (
          <ProfileSetup
            allowAccountDeletion
            accountDeletionPending={deletionPending}
            onDeletionStatusChange={(requestedAt) => {
              setProfile((prev) =>
                prev ? { ...prev, deletion_requested_at: requestedAt } : prev
              );
            }}
            onDone={async () => {
              const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user!.id)
                .maybeSingle();
              setProfile(data as Profile);
              setTab('home');
            }}
          />
        )}
      </main>

      <nav className="bg-white/90 backdrop-blur-md border-t border-gray-100 sticky bottom-0 z-20">
        <div className="max-w-2xl mx-auto px-2 h-16 flex items-center justify-around">
          <NavButton
            icon={<Home className="w-5 h-5" />}
            label="Accueil"
            active={tab === 'home'}
            onClick={() => setTab('home')}
          />
          <NavButton
            icon={<Compass className="w-5 h-5" />}
            label="Découvrir"
            active={tab === 'discover'}
            onClick={() => setTab('discover')}
          />
          <NavButton
            icon={<Heart className="w-5 h-5" />}
            label="Matchs"
            active={tab === 'matches'}
            onClick={() => setTab('matches')}
          />
          <NavButton
            icon={<User className="w-5 h-5" />}
            label="Profil"
            active={tab === 'profile'}
            onClick={() => setTab('profile')}
          />
        </div>
      </nav>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 sm:px-5 py-2 rounded-lg transition-all ${
        active ? 'text-rose-500' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}
      <span className="text-[11px] sm:text-xs font-medium">{label}</span>
    </button>
  );
}
