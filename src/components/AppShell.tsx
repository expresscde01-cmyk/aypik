import { useState, useEffect, useCallback } from 'react';
import { Compass, Heart, Home, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ADULTS_ONLY_MESSAGE, isAdult } from '@/lib/dating';
import DiscoveryPage from '@/components/DiscoveryPage';
import HomeDashboard from '@/components/HomeDashboard';
import HomeBackButton from '@/components/HomeBackButton';
import MatchesPage from '@/components/MatchesPage';
import NotificationsBell from '@/components/NotificationsBell';
import UnreadBadge from '@/components/UnreadBadge';
import { SiteFooter } from '@/components/LegalTerms';
import ProfileSetup, {
  PROFILE_CARD_COLUMNS,
  type Profile,
} from '@/components/ProfileSetup';
import PhoneVerification from '@/components/PhoneVerification';
import { PHONE_VERIFICATION_REQUIRED_SINCE } from '@/lib/phone';
import { UnreadMessagesProvider, useUnreadMessages } from '@/lib/messaging';
import {
  normalizeOpenMatchesOpts,
  type OpenMatchesOpts,
} from '@/lib/matchesNav';
import { MatchesInboxSyncProvider } from '@/lib/matchesInboxSync';
import { flushDiscoverPrefs } from '@/lib/suggestionPrefs';

type Tab = 'home' | 'discover' | 'matches' | 'profile';

function initialTabFromQuery(): Tab {
  if (typeof window === 'undefined') return 'home';
  const open = new URLSearchParams(window.location.search).get('open');
  if (
    open === 'preferences' ||
    open === 'profile' ||
    open === 'temoignage'
  ) {
    return 'profile';
  }
  return 'home';
}

export default function AppShell() {
  return (
    <UnreadMessagesProvider>
      <MatchesInboxSyncProvider>
        <AppShellView />
      </MatchesInboxSyncProvider>
    </UnreadMessagesProvider>
  );
}

function AppShellView() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTabFromQuery);
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(
    () => new Set([initialTabFromQuery()])
  );
  const [inboxActorId, setInboxActorId] = useState<string | null>(null);
  const [inboxOpenChat, setInboxOpenChat] = useState(false);
  const [inboxHighlight, setInboxHighlight] = useState(false);
  const [inboxHintName, setInboxHintName] = useState<string | null>(null);
  const [inboxPulseCategory, setInboxPulseCategory] = useState<
    'new' | 'wait' | 'first' | null
  >(null);
  const [inboxDeclined, setInboxDeclined] = useState(false);
  const [inboxWaitingIncoming, setInboxWaitingIncoming] = useState(false);
  /** Incrémenté à chaque navigation pour rejouer le focus même si l’acteur est identique. */
  const [inboxFocusKey, setInboxFocusKey] = useState(0);
  const unread = useUnreadMessages();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  /** Invalide Accueil / Découvrir / Matchs uniquement après une vraie sauvegarde de profil. */
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [suggestionPrefsEpoch, setSuggestionPrefsEpoch] = useState(0);

  const persistDiscoverPrefs = useCallback(() => {
    flushDiscoverPrefs(user?.id);
    setSuggestionPrefsEpoch((n) => n + 1);
  }, [user?.id]);

  const mountTab = useCallback((next: Tab) => {
    setMountedTabs((prev) => {
      if (prev.has(next)) return prev;
      const copy = new Set(prev);
      copy.add(next);
      return copy;
    });
  }, []);

  const reloadViewerProfile = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_CARD_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();
    setProfile(data as Profile | null);
    setProfileEpoch((n) => n + 1);
    return data as Profile | null;
  }, [user]);

  const openTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      if (tab === 'discover' && next !== 'discover') {
        persistDiscoverPrefs();
      }
      mountTab(next);
      setTab(next);
    },
    [mountTab, persistDiscoverPrefs, tab]
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_CARD_COLUMNS)
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

  const isPostPhoneRequirementAccount =
    Boolean(user?.created_at) &&
    new Date(user!.created_at) >= new Date(PHONE_VERIFICATION_REQUIRED_SINCE);
  const needsPhoneVerification =
    Boolean(user) && !user?.phone_confirmed_at && isPostPhoneRequirementAccount;
  const needsProfile = !profileLoading && !profile;
  const displayName =
    profile?.display_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Membre';
  const accountDeleted = Boolean(profile?.deletion_requested_at);

  const openMatches = (actorId?: string | null, opts?: OpenMatchesOpts) => {
    const {
      openChat,
      highlight,
      hintName,
      pulseCategory,
      declined,
      waitingIncoming,
    } = normalizeOpenMatchesOpts(opts);
    setInboxActorId(actorId ?? null);
    setInboxOpenChat(openChat);
    setInboxHighlight(highlight);
    setInboxHintName(hintName);
    setInboxPulseCategory(pulseCategory);
    setInboxDeclined(declined);
    setInboxWaitingIncoming(waitingIncoming);
    setInboxFocusKey((k) => k + 1);
    if (tab === 'discover') {
      persistDiscoverPrefs();
    }
    mountTab('matches');
    setTab('matches');
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
      </div>
    );
  }

  if (needsPhoneVerification) {
    return <PhoneVerification />;
  }

  if (needsProfile) {
    return (
      <ProfileSetup
        onDone={async () => {
          await reloadViewerProfile();
        }}
      />
    );
  }

  if (accountDeleted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-white to-amber-50">
        <div className="w-full max-w-md bg-white rounded-3xl border border-rose-100 shadow-xl shadow-rose-100/40 p-8 text-center space-y-4">
          <p className="text-gray-800 text-sm leading-relaxed">
            Ce compte a été supprimé.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (profile && !isAdult(profile.birth_date)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-white to-amber-50">
        <div className="w-full max-w-md bg-white rounded-3xl border border-rose-100 shadow-xl shadow-rose-100/40 p-8 text-center space-y-4">
          <p className="text-gray-800 text-sm leading-relaxed">
            {ADULTS_ONLY_MESSAGE}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 min-h-0">
        {mountedTabs.has('home') && (
          <div className={tab === 'home' ? undefined : 'hidden'}>
            <HomeDashboard
              displayName={displayName}
              onSignOut={signOut}
              onOpenDiscover={() => openTab('discover')}
              onOpenMatches={openMatches}
              onOpenProfile={() => setTab('profile')}
              unreadTotal={unread.total}
              unreadBySender={unread.bySender}
              profileEpoch={profileEpoch}
              suggestionPrefsEpoch={suggestionPrefsEpoch}
              notificationsActive={tab === 'home'}
            />
          </div>
        )}
        {mountedTabs.has('discover') && (
          <div
            className={
              tab === 'discover' ? 'min-h-full flex flex-col' : 'hidden'
            }
          >
            <header className="sticky top-0 z-10 discover-sticky-header">
              <div className="max-w-2xl mx-auto px-4 pt-3 pb-4 sm:pt-4 sm:pb-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <HomeBackButton onClick={() => openTab('home')} />
                    <h1 className="mt-3 text-2xl font-bold text-gray-900 tracking-tight">
                      Découvrir
                    </h1>
                    <span
                      className="mt-1.5 block h-0.5 w-8 rounded-full bg-gradient-to-r from-rose-400 to-amber-400"
                      aria-hidden
                    />
                    <p className="mt-1.5 text-sm text-gray-500 leading-snug">
                      Découvre des profils qui pourraient te plaire
                    </p>
                    <p className="mt-2 text-xs text-gray-500 leading-relaxed italic">
                      <em>
                        Les filtres sélectionnés ici s’appliqueront
                        automatiquement dès que tu quitteras cette page pour
                        personnaliser les suggestions qui te seront faites
                        sur ta page Accueil.
                      </em>
                    </p>
                  </div>
                  <div className="shrink-0 -mr-1 -mt-0.5">
                    <NotificationsBell
                      onOpenInbox={openMatches}
                      active={tab === 'discover'}
                    />
                  </div>
                </div>
              </div>
            </header>
            <DiscoveryPage
              unreadBySender={unread.bySender}
              onOpenUnreadChat={(actorId) => openMatches(actorId, true)}
              profileEpoch={profileEpoch}
              pageActive={tab === 'discover'}
            />
          </div>
        )}
        {mountedTabs.has('matches') && (
          <div
            className={
              tab === 'matches' ? 'min-h-full flex flex-col' : 'hidden'
            }
          >
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100">
              <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
                <HomeBackButton onClick={() => openTab('home')} />
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {displayName}
                </span>
                <NotificationsBell
                  onOpenInbox={openMatches}
                  active={tab === 'matches'}
                />
              </div>
            </div>
            <MatchesPage
              pageActive={tab === 'matches'}
              focusActorId={inboxActorId}
              focusOpenChat={inboxOpenChat}
              focusHighlight={inboxHighlight}
              focusHintName={inboxHintName}
              focusPulseCategory={inboxPulseCategory}
              focusDeclined={inboxDeclined}
              focusWaitingIncoming={inboxWaitingIncoming}
              focusKey={inboxFocusKey}
              profileEpoch={profileEpoch}
              onChatClosed={() => void unread.refresh()}
              onFocusActorConsumed={() => {
                setInboxActorId(null);
                setInboxOpenChat(false);
                setInboxHighlight(false);
                setInboxHintName(null);
                setInboxPulseCategory(null);
                setInboxDeclined(false);
                setInboxWaitingIncoming(false);
              }}
            />
          </div>
        )}
        {tab === 'profile' && (
          <ProfileSetup
            allowAccountDeletion
            onHome={() => openTab('home')}
            onDone={async () => {
              await reloadViewerProfile();
              mountTab('home');
              setTab('home');
            }}
          />
        )}
      </main>

      <SiteFooter compact />

      <nav className="bg-white/90 backdrop-blur-md border-t border-gray-100 sticky bottom-0 z-20">
        <div className="max-w-2xl mx-auto px-2 h-16 flex items-center justify-around">
          <NavButton
            icon={<Home className="w-5 h-5" />}
            label="Accueil"
            active={tab === 'home'}
            onClick={() => openTab('home')}
          />
          <NavButton
            icon={<Compass className="w-5 h-5" />}
            label="Découvrir"
            active={tab === 'discover'}
            onClick={() => openTab('discover')}
          />
          <NavButton
            icon={<Heart className="w-5 h-5" />}
            label="Matchs"
            active={tab === 'matches'}
            badge={unread.total}
            onClick={() => openMatches()}
          />
          <NavButton
            icon={<User className="w-5 h-5" />}
            label="Profil"
            active={tab === 'profile'}
            onClick={() => {
              if (tab === 'discover') {
                persistDiscoverPrefs();
              }
              setTab('profile');
            }}
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
  badge = 0,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 px-3 sm:px-5 py-2 rounded-lg transition-all ${
        active
          ? 'text-rose-500'
          : badge > 0
            ? 'text-rose-500'
            : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <UnreadBadge
            count={badge}
            pulse
            className="absolute -top-1.5 -right-2 text-[9px] h-[1.05rem] min-w-[1.05rem]"
          />
        )}
      </span>
      <span className="text-[11px] sm:text-xs font-medium">{label}</span>
    </button>
  );
}
