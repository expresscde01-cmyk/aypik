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
  Plus,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { requestAccountDeletion } from '@/lib/deleteAccount';
import { useMembership } from '@/lib/useMembership';
import {
  uploadProfilePhoto,
  validateProfilePhoto,
} from '@/lib/profilePhoto';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { FounderBadge, BoostedBadge } from '@/components/membership/Badges';
import TestimonialForm from '@/components/testimonials/TestimonialForm';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import { ContactLink, LegalLink } from '@/components/LegalTerms';
import ChangePasswordSection from '@/components/ChangePasswordSection';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { isPaidPremiumActive } from '@/lib/membership';
import { CityAutocomplete } from '@/components/CityAutocomplete';
import {
  CITY_SELECTION_REQUIRED_ERROR,
  communeFromStoredLabel,
  type GeoCommune,
} from '@/lib/geoCommunes';
import { resolveCommuneCoordinates } from '@/lib/profileCoordinates';
import {
  INTEREST_CATEGORIES,
  ALL_SUGGESTED_INTERESTS,
  MAX_CUSTOM_INTEREST_LENGTH,
  MIN_INTERESTS,
  INTERESTS_MIN_ERROR,
  normalizeInterestKey,
  sanitizeCustomInterest,
} from '@/lib/interests';
import { MEMBERSHIP_REQUIRED_ERROR } from '@/lib/membership';
import { sendFounderWelcomeEmail } from '@/lib/email';
import { userErrorMessage } from '@/lib/userError';
import {
  ADULTS_ONLY_MESSAGE,
  MIN_USER_AGE,
  isAdult,
  latestBirthDateForAge,
} from '@/lib/dating';
import BirthDatePicker from '@/components/BirthDatePicker';
import HomeBackButton from '@/components/HomeBackButton';

export type ProfileGender = 'homme' | 'femme';

export interface Profile {
  id: string;
  display_name: string;
  birth_date: string;
  bio: string;
  has_children: boolean;
  location: string;
  interests: string[];
  photo_url: string;
  gender?: ProfileGender | null;
  lat?: number | null;
  lng?: number | null;
  last_active_at?: string | null;
  email_notifications_enabled?: boolean;
  deletion_requested_at?: string | null;
}

/** Colonnes publiques d’un profil (listes / cartes) — pas de SELECT *. */
export const PROFILE_CARD_COLUMNS =
  'id, display_name, birth_date, bio, has_children, location, interests, photo_url, gender, lat, lng, last_active_at, deletion_requested_at';

/** Profil du compte connecté (préférences e-mail en plus). */
export const PROFILE_OWN_COLUMNS = `${PROFILE_CARD_COLUMNS}, email_notifications_enabled`;

export default function ProfileSetup({
  onDone,
  onHome,
  allowAccountDeletion = false,
}: {
  onDone: () => void;
  /** Retour Accueil (onglet Profil connecté). Absent au 1er setup. */
  onHome?: () => void;
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [hasChildren, setHasChildren] = useState(false);
  const [location, setLocation] = useState('');
  const [selectedCity, setSelectedCity] = useState<GeoCommune | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(null);
  const [customInterest, setCustomInterest] = useState('');
  const [gender, setGender] = useState<ProfileGender | null>(null);
  const [genderLocked, setGenderLocked] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] =
    useState(true);
  const [prefsHint, setPrefsHint] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [profileExists, setProfileExists] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preferencesRef = useRef<HTMLDivElement>(null);
  const testimonialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_OWN_COLUMNS)
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        setError(userErrorMessage(error, 'Impossible de charger ton profil'));
        setLoading(false);
        return;
      }

      if (data) {
        setProfileExists(true);
        setDisplayName(data.display_name || '');
        setBirthDate(data.birth_date || '');
        setBio(data.bio || '');
        setHasChildren(data.has_children ?? false);
        setLocation(data.location || '');
        setSelectedCity(communeFromStoredLabel(data.location || ''));
        setCityError(null);
        setInterests(data.interests || []);
        setPhotoUrl(data.photo_url || '');
        if (!data.birth_date) {
          const metaDob = user.user_metadata?.birth_date;
          if (typeof metaDob === 'string') setBirthDate(metaDob);
        }
        if (data.gender === 'homme' || data.gender === 'femme') {
          setGender(data.gender);
          setGenderLocked(true);
        } else {
          setGender(null);
          setGenderLocked(false);
        }
        setEmailNotificationsEnabled(
          data.email_notifications_enabled !== false
        );
      } else {
        setProfileExists(false);
        const metaDob = user.user_metadata?.birth_date;
        if (typeof metaDob === 'string') setBirthDate(metaDob);
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    if (open !== 'preferences' && open !== 'temoignage') return;

    if (open === 'preferences') setPrefsHint(true);
    const t = window.setTimeout(() => {
      const target =
        open === 'temoignage'
          ? testimonialRef.current
          : preferencesRef.current;
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState({}, '', url.pathname + url.search);

    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  const handleEmailNotificationsChange = async (enabled: boolean) => {
    setPrefsHint(false);
    setPrefsSaved(false);
    setEmailNotificationsEnabled(enabled);

    // Inscription : pas encore de ligne profiles → valeur incluse au premier upsert.
    if (!user || !profileExists) return;

    setPrefsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ email_notifications_enabled: enabled })
        .eq('id', user.id);

      if (updateError) throw updateError;
      setPrefsSaved(true);
      window.setTimeout(() => setPrefsSaved(false), 2200);
    } catch (err) {
      setEmailNotificationsEnabled(!enabled);
      setError(
        userErrorMessage(err, 'Impossible d’enregistrer la préférence e-mail')
      );
    } finally {
      setPrefsSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setError((prev) => (prev === INTERESTS_MIN_ERROR ? null : prev));
    const already = interests.some(
      (i) => normalizeInterestKey(i) === normalizeInterestKey(interest)
    );
    if (already) {
      setInterests((prev) =>
        prev.filter(
          (i) => normalizeInterestKey(i) !== normalizeInterestKey(interest)
        )
      );
      return;
    }
    setInterests((prev) => [...prev, interest]);
  };

  const addCustomInterest = () => {
    const cleaned = sanitizeCustomInterest(customInterest);
    if (!cleaned) {
      setCustomInterest('');
      return;
    }

    const key = normalizeInterestKey(cleaned);
    const alreadySelected = interests.some(
      (i) => normalizeInterestKey(i) === key
    );
    if (alreadySelected) {
      setCustomInterest('');
      return;
    }

    const known = ALL_SUGGESTED_INTERESTS.find(
      (i) => normalizeInterestKey(i) === key
    );
    const label = known ?? cleaned;

    setError((prev) => (prev === INTERESTS_MIN_ERROR ? null : prev));
    setInterests((prev) => [...prev, label]);
    setCustomInterest('');
  };

  const removeInterest = (interest: string) => {
    setError((prev) => (prev === INTERESTS_MIN_ERROR ? null : prev));
    setInterests((prev) => prev.filter((i) => i !== interest));
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
      }
    } finally {
      setClaimingOffer(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCityError(null);

    if (isSignup && !status.membership_linked) {
      setError(
        'Choisis et active d’abord une offre pour continuer l’inscription.'
      );
      return;
    }

    const cityOk =
      selectedCity !== null &&
      selectedCity.label === location.trim();

    if (!cityOk) {
      setCityError(CITY_SELECTION_REQUIRED_ERROR);
      setError(CITY_SELECTION_REQUIRED_ERROR);
      return;
    }

    if (interests.length < MIN_INTERESTS) {
      setError(INTERESTS_MIN_ERROR);
      return;
    }

    if (!birthDate) {
      setError('Indique ta date de naissance.');
      return;
    }

    if (!isAdult(birthDate)) {
      setError(ADULTS_ONLY_MESSAGE);
      return;
    }

    setSaving(true);

    try {
      if (!user) throw new Error('Non connecté');
      if (hasChildren) {
        throw new Error(
          "Ce site est réservé aux personnes sans enfants. Tu as indiqué avoir des enfants."
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

      const payload: {
        id: string;
        display_name: string;
        birth_date: string;
        bio: string;
        has_children: boolean;
        location: string;
        interests: string[];
        photo_url: string;
        email_notifications_enabled: boolean;
        gender?: ProfileGender;
        lat?: number | null;
        lng?: number | null;
      } = {
        id: user.id,
        display_name: displayName,
        birth_date: birthDate,
        bio,
        has_children: hasChildren,
        location: selectedCity.label,
        interests,
        photo_url: nextPhotoUrl,
        email_notifications_enabled: emailNotificationsEnabled,
      };

      if (!genderLocked && (gender === 'homme' || gender === 'femme')) {
        payload.gender = gender;
      }

      const coords = await resolveCommuneCoordinates({
        lat: selectedCity.lat,
        lng: selectedCity.lng,
        label: selectedCity.label,
      });
      if (coords) {
        payload.lat = coords.lat;
        payload.lng = coords.lng;
      }

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(payload);

      if (upsertError) throw upsertError;

      if (!genderLocked && (gender === 'homme' || gender === 'femme')) {
        setGenderLocked(true);
      }

      setProfileExists(true);

      const membership = await ensureMembershipLinked();
      if (!membership.ok) {
        throw new Error(membership.error || MEMBERSHIP_REQUIRED_ERROR);
      }

      if (isSignup && membership.is_founder) {
        // Non bloquant : l'inscription reste valide même si Resend échoue.
        void sendFounderWelcomeEmail({ displayName });
      }

      setPhotoUrl(nextPhotoUrl);
      setPhotoFile(null);
      setPhotoFileName(null);
      setLocation(selectedCity.label);
      onDone();
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    setDeleting(true);

    try {
      const deleteError = await requestAccountDeletion();
      if (deleteError) throw new Error(deleteError);

      setConfirmDelete(false);
      await signOut();
    } catch (err) {
      setError(userErrorMessage(err));
    } finally {
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
        {isSignup && (
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2"
            >
              Se déconnecter
            </button>
          </div>
        )}

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

        {!isSignup && !SITE_FREE_MODE && isPaidPremiumActive(status) && (
          <div ref={testimonialRef} className="mb-6 space-y-4">
            <TestimonialsSection variant="app" />
            <TestimonialForm status={status} />
          </div>
        )}

        {error && isSignup && !canEditProfile && (
          <div className="mb-6 flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {canEditProfile && (
          <>
        {onHome ? (
          <div className="mb-4 flex justify-start">
            <HomeBackButton onClick={onHome} />
          </div>
        ) : null}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 shadow-lg shadow-rose-200 mb-3 animate-pop">
            <Heart className="w-7 h-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mon profil</h1>
          <p className="text-gray-500 text-sm mt-1">
            Renseigne tes informations pour apparaître dans les recherches
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
                Ta photo
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
              placeholder="Ton prénom ou pseudo"
            />
          </div>

          {/* Birth date */}
          <div>
            <label
              htmlFor="profile-birth-date-year"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Date de naissance <span className="text-rose-500">*</span>
            </label>
            <BirthDatePicker
              id="profile-birth-date"
              required
              value={birthDate}
              maxAgeDate={latestBirthDateForAge(MIN_USER_AGE)}
              onChange={setBirthDate}
            />
          </div>

          {/* Genre : optionnel. Une fois Homme/Femme enregistré, le bloc disparaît. */}
          {!genderLocked && (
            <div>
              {gender === null && (
                <p className="text-sm text-gray-500">Genre : Non spécifié</p>
              )}
              <div
                className={`flex gap-2 ${gender === null ? 'mt-2' : ''}`}
                role="group"
                aria-label="Genre (optionnel)"
              >
              <button
                type="button"
                aria-pressed={gender === 'homme'}
                onClick={() =>
                  setGender((prev) => (prev === 'homme' ? null : 'homme'))
                }
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  gender === 'homme'
                    ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-500'
                }`}
              >
                Un homme
              </button>
              <button
                type="button"
                aria-pressed={gender === 'femme'}
                onClick={() =>
                  setGender((prev) => (prev === 'femme' ? null : 'femme'))
                }
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  gender === 'femme'
                    ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-500'
                }`}
              >
                Une femme
              </button>
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label
              htmlFor="profile-city"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              Ville <span className="text-rose-500">*</span>
            </label>
            <CityAutocomplete
              id="profile-city"
              value={location}
              onChange={(next) => {
                setLocation(next);
                setCityError(null);
                setError((prev) =>
                  prev === CITY_SELECTION_REQUIRED_ERROR ? null : prev
                );
              }}
              selected={selectedCity}
              onSelect={(commune) => {
                setSelectedCity(commune);
                if (commune) {
                  setCityError(null);
                  setError((prev) =>
                    prev === CITY_SELECTION_REQUIRED_ERROR ? null : prev
                  );
                }
              }}
              invalid={Boolean(cityError)}
              placeholder="Tape puis choisis dans la liste…"
            />
            {cityError && (
              <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{cityError}</span>
              </p>
            )}
          </div>

          {/* Has children */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <Baby className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  As-tu des enfants ?
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
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-gray-700">
              Centres d&apos;intérêt
            </label>

            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-rose-50/60 border border-rose-100">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-semibold bg-rose-500 text-white shadow-sm shadow-rose-200"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => removeInterest(interest)}
                      className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
                      aria-label={`Retirer ${interest}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-4">
              {INTEREST_CATEGORIES.map((category) => (
                <div key={category.id}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    {category.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {category.interests.map((interest) => {
                      const selected = interests.some(
                        (i) =>
                          normalizeInterestKey(i) ===
                          normalizeInterestKey(interest)
                      );
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

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Ajouter le vôtre
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInterest}
                  maxLength={MAX_CUSTOM_INTEREST_LENGTH}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomInterest();
                    }
                  }}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 text-sm placeholder-gray-400"
                  placeholder="Ex. Astronomie amateur, Bridge…"
                />
                <button
                  type="button"
                  onClick={addCustomInterest}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter
                </button>
              </div>
            </div>
          </div>

          {/* Bio (optionnelle) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Bio{' '}
              <span className="font-normal text-gray-400">(optionnel)</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400 resize-none"
              placeholder="Parle de toi, ce que tu aimes, ce que tu recherches..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {bio.length}/500
            </p>
          </div>

          {/* Préférences de communication */}
          <div
            ref={preferencesRef}
            id="email-preferences"
            className={`rounded-2xl border p-4 sm:p-5 space-y-3 transition-colors ${
              prefsHint
                ? 'border-rose-300 bg-rose-50/60 ring-2 ring-rose-100'
                : 'border-gray-100 bg-gray-50/80'
            }`}
          >
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-tight">
                Préférences
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Gère les e-mails de notification envoyés par Aypik (flashs,
                actualisations, messages d’accueil, etc.).
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotificationsEnabled}
                disabled={prefsSaving}
                onChange={(e) => {
                  void handleEmailNotificationsChange(e.target.checked);
                }}
                className="mt-1 rounded border-gray-300 text-rose-500 focus:ring-rose-400 disabled:opacity-60"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-800">
                  Recevoir les notifications et actualisations par e-mail
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                  En cochant cette option, tu acceptes de recevoir les
                  communications non essentielles de la plateforme, telles que
                  les nouveautés, les flashs ou les actualités du site. Les
                  e-mails strictement nécessaires au bon fonctionnement de ton
                  compte pourront toujours t&apos;être envoyés.
                </span>
                {(prefsSaving || prefsSaved) && (
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${
                      prefsSaved ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    {prefsSaving ? (
                      'Enregistrement…'
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Préférence enregistrée
                      </>
                    )}
                  </span>
                )}
              </span>
            </label>
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
              : 'Enregistrer mon profil'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
          </>
        )}

        {allowAccountDeletion && <ChangePasswordSection />}

        {allowAccountDeletion && (
          <p className="mt-6 text-center text-xs text-gray-400 leading-relaxed">
            Vous avez des questions ? <ContactLink />
            <br />
            Conditions d&apos;utilisation :{' '}
            <LegalLink className="underline underline-offset-2 hover:text-rose-600 transition-colors font-medium text-gray-500" />
          </p>
        )}

        {allowAccountDeletion && (
          <div className="mt-4 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-red-100 p-6 sm:p-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">SUPPRESSION DU COMPTE</h2>
            <p className="text-sm text-gray-500 mb-4">
              La suppression de ton compte est immédiate et définitive.
              Ton profil, tes likes et tes matchs seront effacés.
            </p>

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer mon compte
            </button>

            {confirmDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="delete-account-title"
                  className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4"
                >
                  <h3
                    id="delete-account-title"
                    className="text-base font-bold text-gray-900"
                  >
                    Attention
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Cette action est immédiate et définitive. Toutes tes
                    données seront effacées. Si tu es Membre Fondateur, ton
                    statut et ton numéro d&apos;inscription seront également
                    perdus et ne pourront pas être récupérés.
                  </p>
                  <div className="flex gap-3 pt-1">
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
