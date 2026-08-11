import { useState, useEffect } from 'react';
import { Heart, AlertCircle, Check, Baby, Camera, ArrowRight, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { deleteAccount } from '@/lib/deleteAccount';
import { useMembership } from '@/lib/useMembership';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { FounderBadge, BoostedBadge } from '@/components/membership/Badges';
import { LegalLink } from '@/components/LegalTerms';

export interface Profile {
  id: string;
  display_name: string;
  birth_date: string;
  bio: string;
  has_children: boolean;
  location: string;
  interests: string[];
  photo_url: string;
}

const SUGGESTED_INTERESTS = [
  'Voyage', 'Cuisine', 'Cinéma', 'Sport', 'Lecture', 'Musique',
  'Randonnée', 'Gaming', 'Art', 'Yoga', 'Photographie', 'Animaux',
];

export default function ProfileSetup({
  onDone,
  allowAccountDeletion = false,
}: {
  onDone: () => void;
  allowAccountDeletion?: boolean;
}) {
  const { user, signOut } = useAuth();
  const { status, purchaseBoost, refresh } = useMembership();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [hasChildren, setHasChildren] = useState(false);
  const [location, setLocation] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        setDisplayName(data.display_name || '');
        setBirthDate(data.birth_date || '');
        setBio(data.bio || '');
        setHasChildren(data.has_children ?? false);
        setLocation(data.location || '');
        setInterests(data.interests || []);
        setPhotoUrl(data.photo_url || '');
      }
      setLoading(false);
    })();
  }, [user]);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (!user) throw new Error('Non connecté');
      if (hasChildren) {
        throw new Error(
          "Ce site est réservé aux personnes sans enfants. Vous avez indiqué avoir des enfants."
        );
      }

      const payload = {
        id: user.id,
        display_name: displayName,
        birth_date: birthDate,
        bio,
        has_children: hasChildren,
        location,
        interests,
        photo_url: photoUrl,
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(payload);

      if (upsertError) throw upsertError;
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    setDeleting(true);

    try {
      const deleteError = await deleteAccount();
      if (deleteError) throw new Error(deleteError);

      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Bannière Fondateur en tout premier — visible pour tous */}
        <div className="mb-6">
          <MembershipPanel
            status={status}
            onPurchaseBoost={purchaseBoost}
            onRefresh={refresh}
          />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 shadow-lg shadow-rose-200 mb-3 animate-pop">
            <Heart className="w-7 h-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mon profil</h1>
          <p className="text-gray-500 text-sm mt-1">
            Renseignez vos informations pour apparaître dans les recherches
          </p>
          {(status.is_founder || status.has_boost) && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {status.is_founder && (
                <FounderBadge number={status.founder_number} />
              )}
              {status.has_boost && <BoostedBadge />}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8 space-y-6"
        >
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 flex items-center justify-center flex-shrink-0 border-2 border-rose-100">
              {photoUrl ? (
                <img src={photoUrl} alt="Aperçu" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-7 h-7 text-rose-300" />
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                URL de votre photo
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 text-sm placeholder-gray-400"
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Display name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Nom affiché <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
              placeholder="Votre prénom ou pseudo"
            />
          </div>

          {/* Birth date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Date de naissance <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Ville / Région
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
              placeholder="Paris, Lyon..."
            />
          </div>

          {/* Has children */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <Baby className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Avez-vous des enfants ?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHasChildren(false)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      !hasChildren
                        ? 'bg-green-500 text-white border-green-500 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Non
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasChildren(true)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      hasChildren
                        ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Oui
                  </button>
                </div>
                {hasChildren && (
                  <p className="text-xs text-rose-600 mt-2 flex items-center gap-1 animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Ce site est réservé aux personnes sans enfants.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Interests */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2.5">
              Centres d'intérêt
            </label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_INTERESTS.map((interest) => {
                const selected = interests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-all ${
                      selected
                        ? 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-200'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-500'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5 inline mr-1" />}
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400 resize-none"
              placeholder="Parlez de vous, ce que vous aimez, ce que vous recherchez..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {bio.length}/500
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || hasChildren}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? 'Sauvegarde...' : 'Enregistrer mon profil'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {allowAccountDeletion && (
          <p className="mt-6 text-center text-xs text-gray-400">
            Conditions d&apos;utilisation et de vente :{' '}
            <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors font-medium text-gray-500">
              CGU / CGV
            </LegalLink>
          </p>
        )}

        {allowAccountDeletion && (
          <div className="mt-4 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-red-100 p-6 sm:p-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">SUPPRESSION DU COMPTE</h2>
            <p className="text-sm text-gray-500 mb-4">
              Vous partez ? Cette action est irréversible : votre profil, vos likes et vos
              matchs seront supprimés définitivement.
            </p>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer mon compte
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-700 bg-red-50 rounded-xl p-3">
                  Êtes-vous sûr(e) ? Cette action est irréversible.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {deleting ? 'Suppression...' : 'Confirmer la suppression'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
