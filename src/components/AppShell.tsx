import { useState, useEffect } from 'react';
import { Heart, Home, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import MatchesPage from '@/components/MatchesPage';
import ProfileSetup from '@/components/ProfileSetup';
import LandingPage from '@/components/LandingPage';
import type { Profile } from '@/components/ProfileSetup';
import { MIN_INTERESTS } from '@/lib/interests';

type Tab = 'home' | 'matches' | 'profile';

export default function AppShell() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  /** Ouvre le formulaire d’inscription depuis l’accueil (CTA visible). */
  const [forceSignupForm, setForceSignupForm] = useState(false);
  const signupOkKey = user ? `aypik_signup_ok_${user.id}` : null;
  const [signupValidated, setSignupValidated] = useState<boolean | null>(null);

  useEffect(() => {
    if (!signupOkKey) {
      setSignupValidated(false);
      return;
    }
    setSignupValidated(localStorage.getItem(signupOkKey) === '1');
  }, [signupOkKey]);

  const markSignupValidated = () => {
    if (signupOkKey) localStorage.setItem(signupOkKey, '1');
    setSignupValidated(true);
  };

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

  const profileComplete = (p: Profile | null) =>
    Boolean(
      p?.display_name?.trim() &&
        p.birth_date &&
        p.location?.trim() &&
        Array.isArray(p.interests) &&
        p.interests.length >= MIN_INTERESTS
    );
  // Inscription non finalisée → formulaire + « Validez votre inscription »
  // (évite l’accueil « Nos offres » sans bouton de validation).
  const needsProfile = !profileLoading && !profileComplete(profile);
  const mustFinalizeSignup =
    !profileLoading && signupValidated === false;
  const displayName =
    profile?.display_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Membre';

  if (profileLoading || signupValidated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
      </div>
    );
  }

  if (needsProfile || forceSignupForm || mustFinalizeSignup) {
    return (
      <ProfileSetup
        onDone={async () => {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user!.id)
            .maybeSingle();
          setProfile(data as Profile);
          markSignupValidated();
          setForceSignupForm(false);
          setTab('home');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 min-h-0">
        {tab === 'home' && (
          <LandingPage
            displayName={displayName}
            onSignOut={signOut}
            onLogoClick={() => setTab('home')}
            onPrimaryCta={() => setTab('matches')}
            onValidateSignup={
              signupValidated ? undefined : () => setForceSignupForm(true)
            }
          />
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
              </div>
            </div>
            <MatchesPage />
          </div>
        )}
        {tab === 'profile' && (
          <ProfileSetup
            allowAccountDeletion
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
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-around">
          <NavButton
            icon={<Home className="w-5 h-5" />}
            label="Accueil"
            active={tab === 'home'}
            onClick={() => setTab('home')}
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
      className={`flex flex-col items-center gap-0.5 px-6 py-2 rounded-lg transition-all ${
        active ? 'text-rose-500' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
