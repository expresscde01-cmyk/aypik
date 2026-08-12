import { useState, useEffect, useRef } from 'react';
import {
  Heart,
  AlertCircle,
  Check,
  Baby,
  Camera,
  ArrowRight,
  Trash2,
  ImagePlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { deleteAccount } from '@/lib/deleteAccount';
import { useMembership } from '@/lib/useMembership';
import {
  uploadProfilePhoto,
  validateProfilePhoto,
} from '@/lib/profilePhoto';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { FounderBadge, BoostedBadge } from '@/components/membership/Badges';
import { LegalLink } from '@/components/LegalTerms';
import { CityAutocomplete } from '@/components/CityAutocomplete';

import { MEMBERSHIP_REQUIRED_ERROR } from '@/lib/membership';
import {
  ALL_SUGGESTED_INTERESTS,
  INTEREST_CATEGORIES,
  MIN_INTERESTS,
} from '@/lib/interests';

const CITY_SELECTION_ERROR =
  'Veuillez sélectionner une ville valide dans la liste déroulante';

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

export default function ProfileSetup({
  onDone,
  allowAccountDeletion = false,
}: {
  onDone: () => void;
  allowAccountDeletion?: boolean;
}) {
  const { user, signOut } = useAuth();
  const {
    status,
    loading: membershipLoading,
    purchaseBoost,
    refresh,
    claimSignupOffer,
    ensureMembershipLinked,
  } = useMembership();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claimingOffer, setClaimingOffer] = useState(false);
  const [scrollToFormAfterClaim, setScrollToFormAfterClaim] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [hasChildren, setHasChildren] = useState(false);
  const [location, setLocation] = useState('');
  const [locationSelected, setLocationSelected] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const nextLocation = data.location || '';
        setLocation(nextLocation);
        setLocationSelected(Boolean(nextLocation.trim()));
        setInterests(data.interests || []);
        setPhotoUrl(data.photo_url || '');
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;

    const validationError = validateProfilePhoto(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setPhotoFile(file);
    setPhotoFileName(file.name);
  };

  const clearSelectedPhoto = () => {
    setPhotoFile(null);
    setPhotoFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isSignup = !allowAccountDeletion;
  const offerChosen = status.membership_linked;
  const canEditProfile = !isSignup || offerChosen;

  const handleClaimOffer = async (offer: 'founder' | 'free') => {
    setError(null);
    setClaimingOffer(true);
    try {
      const result = await claimSignupOffer(offer);
      if (!result.ok) {
        setError(result.error || MEMBERSHIP_REQUIRED_ERROR);
        return;
      }
      setScrollToFormAfterClaim(true);
    } finally {
      setClaimingOffer(false);
    }
  };

  useEffect(() => {
    if (!scrollToFormAfterClaim || !canEditProfile) return;
    const t = window.setTimeout(() => {
      document
        .getElementById('profile-setup-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToFormAfterClaim(false);
    }, 120);
    return () => window.clearTimeout(t);
  }, [scrollToFormAfterClaim, canEditProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignup && !status.membership_linked) {
      setError(
        'Veuillez d’abord choisir et activer une offre pour continuer l’inscription.'
      );
      return;
    }

    if (!location.trim() || !locationSelected) {
      setError(CITY_SELECTION_ERROR);
      return;
    }

    if (interests.length < MIN_INTERESTS) {
      setError(
        `Veuillez sélectionner au moins ${MIN_INTERESTS} centres d’intérêt pour valider votre profil.`
      );
      return;
    }

    setSaving(true);

    try {
      if (!user) throw new Error('Non connecté');
      if (hasChildren) {
        throw new Error(
          "Ce site est réservé aux personnes sans enfants. Vous avez indiqué avoir des enfants."
        );
      }

      let nextPhotoUrl = photoUrl;
      if (photoFile) {
        const { url, error: uploadError } = await uploadProfilePhoto(
          user.id,
          photoFile
        );
        if (uploadError || !url) {
          throw new Error(uploadError || "Échec de l'envoi de la photo.");
        }
        nextPhotoUrl = url;
      }

      const payload = {
        id: user.id,
        display_name: displayName,
        birth_date: birthDate,
        bio,
        has_children: hasChildren,
        location,
        interests,
        photo_url: nextPhotoUrl,
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(payload);

      if (upsertError) throw upsertError;

      const membership = await ensureMembershipLinked();
      if (!membership.ok) {
        throw new Error(membership.error || MEMBERSHIP_REQUIRED_ERROR);
      }

      setPhotoUrl(nextPhotoUrl);
      setPhotoFile(null);
      setPhotoFileName(null);
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

  if (loading || (isSignup && membershipLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <MembershipPanel
            status={status}
            onPurchaseBoost={purchaseBoost}
            onRefresh={refresh}
            signupGate={isSignup}
            claimingOffer={claimingOffer}
            onClaimFounder={() => void handleClaimOffer('founder')}
            onClaimFreemium={() => void handleClaimOffer('free')}
          />
        </div>

        {error && isSignup && !canEditProfile && (
          <div className="mb-6 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {canEditProfile && (
          <>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 shadow-lg shadow-rose-200 mb-3 animate-pop">
            <Heart className="w-7 h-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {isSignup ? 'Finaliser mon inscription' : 'Mon profil'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isSignup
              ? 'Renseignez vos informations, puis validez pour rejoindre Aypik'
              : 'Renseignez vos informations pour apparaître dans les recherches'}
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
          id="profile-setup-form"
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8 space-y-6"
        >
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 flex items-center justify-center flex-shrink-0 border-2 border-rose-100">
              {photoPreview || photoUrl ? (
                <img
                  src={photoPreview || photoUrl}
                  alt="Aperçu"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera className="w-7 h-7 text-rose-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Votre photo
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handlePhotoPick}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-white text-rose-600 text-sm font-semibold hover:bg-rose-50 transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  {photoPreview || photoUrl
                    ? 'Changer de photo'
                    : 'Choisir une photo'}
                </button>
                {photoFile && (
                  <button
                    type="button"
                    onClick={clearSelectedPhoto}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Annuler
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-400 truncate">
                {photoFileName
                  ? photoFileName
                  : 'JPEG, PNG ou WebP · 5 Mo max'}
              </p>
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
            <label
              htmlFor="profile-city"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Ville / Région <span className="text-rose-500">*</span>
            </label>
            <CityAutocomplete
              id="profile-city"
              value={location}
              onChange={setLocation}
              selected={locationSelected}
              onSelectedChange={(nextSelected) => {
                setLocationSelected(nextSelected);
                if (nextSelected) {
                  setError((prev) =>
                    prev === CITY_SELECTION_ERROR ? null : prev
                  );
                }
              }}
              required
              placeholder="Tapez une ville ou un code postal…"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Choisissez une suggestion dans la liste pour valider votre profil.
            </p>
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
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Centres d&apos;intérêt{' '}
              <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Sélectionnez au moins {MIN_INTERESTS} passions ou loisirs
              ({ALL_SUGGESTED_INTERESTS.length}+ suggestions).
            </p>
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              {INTEREST_CATEGORIES.map((category) => (
                <div key={category.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    {category.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {category.items.map((interest) => {
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
                          {selected && (
                            <Check className="w-3.5 h-3.5 inline mr-1" />
                          )}
                          {interest}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {interests.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {interests.length} sélectionné
                {interests.length > 1 ? 's' : ''}
                {interests.length < MIN_INTERESTS
                  ? ` · encore ${MIN_INTERESTS - interests.length} minimum`
                  : ''}
              </p>
            )}
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
            {saving
              ? photoFile
                ? 'Envoi de la photo…'
                : 'Sauvegarde...'
              : isSignup
                ? 'Valider mon inscription'
                : 'Enregistrer mon profil'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
          </>
        )}

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
