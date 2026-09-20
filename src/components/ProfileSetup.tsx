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
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile } from '@/lib/myProfile';
import { useAuth } from '@/lib/auth';
import { requestAccountDeletion } from '@/lib/deleteAccount';
import { useMembership } from '@/lib/useMembership';
import {
  uploadProfilePhoto,
  validateProfilePhoto,
} from '@/lib/profilePhoto';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import TemperamentProfileCard, {
  toggleTemperamentKey,
} from '@/components/TemperamentProfileCard';
import SpokenLanguagesProfileCard from '@/components/SpokenLanguagesProfileCard';
import EmailNotificationsProfileCard from '@/components/EmailNotificationsProfileCard';
import { isNativeLanguageRequired } from '@/lib/isNativeLanguageRequired';
import { sanitizeTemperament } from '@/lib/temperament';
import {
  hasNativeSpokenLanguage,
  parseSpokenLanguages,
  sanitizeSpokenLanguages,
  type SpokenDraft,
  type SpokenLanguage,
} from '@/lib/spokenLanguages';
import { FounderBadge } from '@/components/membership/Badges';
import TestimonialForm from '@/components/testimonials/TestimonialForm';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import ChangePasswordSection from '@/components/ChangePasswordSection';
import PwaInstallCard from '@/components/PwaInstallCard';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import { isPaidPremiumActive } from '@/lib/membership';
import {
  consumeHighlightOfferFromUrl,
  offerCardDomId,
  subscribeHighlightOffer,
  type HighlightOffer,
} from '@/lib/conversionNav';
import { formatBoostUntil } from '@/components/membership/OwnerBoostIndicator';
import { CityAutocomplete } from '@/components/CityAutocomplete';
import { WorldCityAutocomplete } from '@/components/WorldCityAutocomplete';
import {
  citySelectionRequiredError,
  communeFromStoredLabel,
  type GeoCommune,
} from '@/lib/geoCommunes';
import { resolveCommuneCoordinates } from '@/lib/profileCoordinates';
import { countryDisplayName, WORLD_COUNTRIES } from '@/lib/worldGeo';
import type { WorldCityHit } from '@/lib/worldCities';
import {
  INTEREST_CATEGORIES,
  ALL_SUGGESTED_INTERESTS,
  MAX_CUSTOM_INTEREST_LENGTH,
  MIN_INTERESTS,
  interestsMinError,
  displayInterest,
  categoryLabel,
  normalizeInterestKey,
  sanitizeCustomInterest,
} from '@/lib/interests';
import { membershipRequiredError } from '@/lib/membership';
import { sendFounderWelcomeEmail } from '@/lib/email';
import { userErrorMessage } from '@/lib/userError';
import {
  adultsOnlyMessage,
  MIN_USER_AGE,
  isAdult,
  latestBirthDateForAge,
} from '@/lib/dating';
import BirthDatePicker from '@/components/BirthDatePicker';
import { currentLocale } from '@/i18n/documentMeta';
import { dateLocale } from '@/i18n/format';
import { useTranslation } from 'react-i18next';

export type ProfileGender = 'homme' | 'femme';

export interface Profile {
  id: string;
  display_name: string;
  /** Date de naissance : uniquement sur le profil connecté (RPC my_profile). */
  birth_date?: string;
  /** Âge calculé côté serveur (card_profiles / suggest_profiles / my_profile). */
  age?: number;
  bio: string;
  has_children: boolean;
  location: string;
  interests: string[];
  photo_url: string;
  gender?: ProfileGender | null;
  lat?: number | null;
  lng?: number | null;
  is_online?: boolean;
  email_notifications_enabled?: boolean;
  preferred_locale?: string | null;
  deletion_requested_at?: string | null;
  country_code?: string | null;
  city_name?: string | null;
  geoname_id?: number | null;
  world_zone?: string | null;
  discover_mode?: 'detaille' | 'simplifie';
  temperament?: string[] | null;
  languages?: SpokenLanguage[] | null;
}

/** Colonnes publiques d’un profil (listes / cartes) — pas de SELECT *. */
export const PROFILE_CARD_COLUMNS =
  'id, display_name, bio, has_children, location, interests, photo_url, gender, country_code, city_name, geoname_id, discover_mode, temperament, languages, created_at, updated_at';

type ProfileFieldKey =
  | 'city'
  | 'interests'
  | 'birth'
  | 'gender'
  | 'children'
  | 'temperament'
  | 'languages'
  | 'submit';

function profileFormSnapshot(input: {
  displayName: string;
  birthDate: string;
  bio: string;
  hasChildren: boolean;
  location: string;
  countryCode: string;
  interests: string[];
  gender: ProfileGender | null;
  temperament: string[];
  languages: SpokenDraft[];
  photoName: string | null;
}): string {
  return JSON.stringify({
    displayName: input.displayName.trim(),
    birthDate: input.birthDate,
    bio: input.bio,
    hasChildren: input.hasChildren,
    location: input.location.trim(),
    countryCode: input.countryCode,
    interests: input.interests,
    gender: input.gender,
    temperament: sanitizeTemperament(input.temperament),
    languages: input.languages.map((item) => ({
      code: item.code,
      level: item.level,
    })),
    photoName: input.photoName,
  });
}

function scrollToField(el: HTMLElement | null) {
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const COUNTRY_SELECT_OPTIONS = [
  ...WORLD_COUNTRIES.filter((row) => row.iso2 === 'FR'),
  ...WORLD_COUNTRIES.filter((row) => row.iso2 !== 'FR').sort((a, b) =>
    countryDisplayName(a.iso2).localeCompare(
      countryDisplayName(b.iso2),
      dateLocale()
    )
  ),
];

export default function ProfileSetup({
  onDone,
  allowAccountDeletion = false,
  profileFocusKey = 0,
}: {
  onDone: () => void;
  allowAccountDeletion?: boolean;
  /** Incrémenté par AppShell à chaque navigation menu → profil (scroll rejoué). */
  profileFocusKey?: number;
}) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const {
    status,
    loading: membershipLoading,
    error: membershipLoadError,
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
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [hasChildren, setHasChildren] = useState(false);
  const [location, setLocation] = useState('');
  const [countryCode, setCountryCode] = useState('FR');
  const [selectedCity, setSelectedCity] = useState<GeoCommune | null>(null);
  const [selectedWorldCity, setSelectedWorldCity] =
    useState<WorldCityHit | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [temperament, setTemperament] = useState<string[]>([]);
  const [spokenLanguages, setSpokenLanguages] = useState<SpokenDraft[]>([]);
  const [persistedSpokenLanguages, setPersistedSpokenLanguages] = useState<
    SpokenLanguage[]
  >([]);
  const [profileSaved, setProfileSaved] = useState(false);
  const [temperamentError, setTemperamentError] = useState<string | null>(null);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [interestsError, setInterestsError] = useState<string | null>(null);
  const [birthError, setBirthError] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);
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
  const [highlightedOffer, setHighlightedOffer] = useState<HighlightOffer | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preferencesRef = useRef<HTMLDivElement>(null);
  const testimonialRef = useRef<HTMLDivElement>(null);
  const cityFieldRef = useRef<HTMLDivElement>(null);
  const birthFieldRef = useRef<HTMLDivElement>(null);
  const genderFieldRef = useRef<HTMLDivElement>(null);
  const childrenFieldRef = useRef<HTMLDivElement>(null);
  const interestsFieldRef = useRef<HTMLDivElement>(null);
  const temperamentCardRef = useRef<HTMLDivElement>(null);
  const languagesCardRef = useRef<HTMLDivElement>(null);
  const profileSaveRef = useRef<HTMLDivElement>(null);
  const profileBaselineRef = useRef<string>('');

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data, error } = await fetchMyProfile();

      if (error) {
        setError(userErrorMessage(error, t('common.profileLoadError')));
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
        const loadedCountry = String(data.country_code || 'FR')
          .trim()
          .toUpperCase() || 'FR';
        setCountryCode(loadedCountry);
        if (loadedCountry === 'FR') {
          setSelectedCity(communeFromStoredLabel(data.location || ''));
          setSelectedWorldCity(null);
        } else {
          setSelectedCity(null);
          const cityLabel = (data.city_name || data.location || '').trim();
          setSelectedWorldCity(
            cityLabel
              ? {
                  geonameId: Number(data.geoname_id) || 0,
                  nom: cityLabel,
                  label: cityLabel,
                  countryCode: loadedCountry,
                  lat: Number(data.lat) || 0,
                  lng: Number(data.lng) || 0,
                  population: 0,
                  codesPostaux: [],
                  code: String(data.geoname_id || ''),
                }
              : null
          );
        }
        setCityError(null);
        setInterests(data.interests || []);
        const loadedTemperament = sanitizeTemperament(data.temperament);
        const loadedLanguages = parseSpokenLanguages(data.languages);
        setTemperament(loadedTemperament);
        setSpokenLanguages(loadedLanguages);
        setPersistedSpokenLanguages(loadedLanguages);
        setPhotoUrl(data.photo_url || '');
        const loadedGender =
          data.gender === 'homme' || data.gender === 'femme'
            ? data.gender
            : null;
        profileBaselineRef.current = profileFormSnapshot({
          displayName: data.display_name || '',
          birthDate: data.birth_date || (typeof user.user_metadata?.birth_date === 'string'
            ? user.user_metadata.birth_date
            : ''),
          bio: data.bio || '',
          hasChildren: data.has_children ?? false,
          location: data.location || '',
          countryCode: loadedCountry,
          interests: data.interests || [],
          gender: loadedGender,
          temperament: loadedTemperament,
          languages: loadedLanguages,
          photoName: null,
        });
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
    if (open === 'preferences' || open === 'temoignage' || open === 'password') {
      if (open === 'preferences') setPrefsHint(true);
      const t = window.setTimeout(() => {
        const target =
          open === 'temoignage'
            ? testimonialRef.current
            : open === 'password'
              ? document.getElementById('change-password')
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
    }

    if (profileFocusKey > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [loading, profileFocusKey]);

  // Section 3 ter : renvoi depuis un élément grisé (offre correspondante mise
  // en avant + défilement automatique vers sa carte).
  useEffect(() => {
    if (loading) return;
    const offer = consumeHighlightOfferFromUrl();
    if (!offer) return;
    setHighlightedOffer(offer);
    const t = window.setTimeout(() => {
      document.getElementById(offerCardDomId(offer))?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 150);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    return subscribeHighlightOffer((offer) => {
      setHighlightedOffer(offer);
      window.setTimeout(() => {
        document.getElementById(offerCardDomId(offer))?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 150);
    });
  }, []);

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
        userErrorMessage(err, t('profile.emailPrefError'))
      );
    } finally {
      setPrefsSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setError((prev) => (prev === interestsMinError() ? null : prev));
    setInterestsError(null);
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

    setError((prev) => (prev === interestsMinError() ? null : prev));
    setInterests((prev) => [...prev, label]);
    setCustomInterest('');
  };

  const removeInterest = (interest: string) => {
    setError((prev) => (prev === interestsMinError() ? null : prev));
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

  const currentProfileSnapshot = () =>
    profileFormSnapshot({
      displayName,
      birthDate,
      bio,
      hasChildren,
      location,
      countryCode,
      interests,
      gender,
      temperament,
      languages: spokenLanguages,
      photoName: photoFileName,
    });

  const profileDirty =
    !isSignup &&
    !loading &&
    currentProfileSnapshot() !== profileBaselineRef.current;

  useEffect(() => {
    if (!profileDirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [profileDirty]);

  const failField = (key: ProfileFieldKey, message: string) => {
    if (isSignup || key === 'submit') setError(message);
    else setError(null);
    if (key === 'city') setCityError(message);
    if (key === 'interests') setInterestsError(message);
    if (key === 'birth') setBirthError(message);
    if (key === 'gender') setGenderError(message);
    if (key === 'temperament') setTemperamentError(message);
    if (key === 'languages') setLanguagesError(message);
    const targets: Record<ProfileFieldKey, HTMLElement | null> = {
      city: cityFieldRef.current,
      interests: interestsFieldRef.current,
      birth: birthFieldRef.current,
      gender: genderFieldRef.current,
      children: childrenFieldRef.current,
      temperament: temperamentCardRef.current,
      languages: languagesCardRef.current,
      submit: profileSaveRef.current,
    };
    scrollToField(targets[key]);
  };

  const handleClaimOffer = async (offer: 'founder' | 'free') => {
    setError(null);
    setClaimingOffer(true);
    try {
      const result = await claimSignupOffer(offer);
      if (!result.ok) {
        setError(result.error || membershipRequiredError());
      }
    } finally {
      setClaimingOffer(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCityError(null);
    setInterestsError(null);
    setBirthError(null);
    setGenderError(null);
    setTemperamentError(null);
    setLanguagesError(null);
    setProfileSaved(false);

    if (isSignup && !status.membership_linked) {
      setError(t('profile.chooseOfferFirst'));
      return;
    }

    const france = countryCode === 'FR';
    const cityOk = france
      ? selectedCity !== null && selectedCity.label === location.trim()
      : selectedWorldCity !== null &&
        selectedWorldCity.label === location.trim();

    if (!cityOk) {
      failField('city', citySelectionRequiredError());
      return;
    }

    if (interests.length < MIN_INTERESTS) {
      failField('interests', interestsMinError());
      return;
    }

    if (!birthDate) {
      failField('birth', t('auth.needBirthDate'));
      return;
    }

    if (!isAdult(birthDate)) {
      failField('birth', adultsOnlyMessage());
      return;
    }

    if (!genderLocked && gender !== 'homme' && gender !== 'femme') {
      failField('gender', t('profile.genderRequired'));
      return;
    }

    if (hasChildren) {
      failField('children', t('profile.childfreeBlocked'));
      return;
    }

    const sanitizedTemperament = sanitizeTemperament(temperament);
    const completeLanguages = sanitizeSpokenLanguages(spokenLanguages);

    if (!isSignup) {
      if (spokenLanguages.some((item) => !item.level)) {
        failField('languages', t('languages.needLevel'));
        return;
      }
      if (
        isNativeLanguageRequired({ country_code: countryCode }, status) &&
        !hasNativeSpokenLanguage(completeLanguages)
      ) {
        failField('languages', t('languages.nativeRequiredProfile'));
        return;
      }
    }

    setSaving(true);

    try {
      if (!user) throw new Error(t('common.notConnected'));

      let nextPhotoUrl = photoUrl;
      if (photoFile) {
        const { url, error: uploadError } = await uploadProfilePhoto(
          user.id,
          photoFile
        );
        if (uploadError || !url) {
          throw new Error(uploadError || t('profile.photoUploadFail'));
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
        country_code: string;
        city_name: string;
        geoname_id: number | null;
        interests: string[];
        photo_url: string;
        email_notifications_enabled?: boolean;
        preferred_locale: string;
        gender?: ProfileGender;
        lat?: number | null;
        lng?: number | null;
        temperament?: string[];
        languages?: SpokenLanguage[];
      } = {
        id: user.id,
        display_name: displayName,
        birth_date: birthDate,
        bio,
        has_children: hasChildren,
        location: france ? selectedCity!.label : selectedWorldCity!.label,
        country_code: countryCode,
        city_name: france ? selectedCity!.nom : selectedWorldCity!.nom,
        geoname_id: france ? null : selectedWorldCity!.geonameId || null,
        interests,
        photo_url: nextPhotoUrl,
        preferred_locale: currentLocale(),
      };
      if (isSignup) {
        payload.email_notifications_enabled = emailNotificationsEnabled;
      } else {
        payload.temperament = sanitizedTemperament;
        payload.languages = completeLanguages;
      }

      if (!genderLocked) {
        payload.gender = gender!;
      }

      if (france) {
        const coords = await resolveCommuneCoordinates({
          lat: selectedCity!.lat,
          lng: selectedCity!.lng,
          label: selectedCity!.label,
        });
        if (coords) {
          payload.lat = coords.lat;
          payload.lng = coords.lng;
        }
      } else {
        payload.lat = selectedWorldCity!.lat;
        payload.lng = selectedWorldCity!.lng;
      }

      if (isSignup) {
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert(payload);
        if (upsertError) throw upsertError;
      } else {
        const { id, ...updateFields } = payload;
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateFields)
          .eq('id', id);
        if (updateError) throw updateError;
      }

      if (!genderLocked) {
        setGenderLocked(true);
      }

      setProfileExists(true);

      if (isSignup) {
        const membership = await ensureMembershipLinked();
        if (!membership.ok) {
          throw new Error(membership.error || membershipRequiredError());
        }

        if (membership.is_founder) {
          // Non bloquant : l'inscription reste valide même si Resend échoue.
          void sendFounderWelcomeEmail({ displayName });
        }
      }

      setPhotoUrl(nextPhotoUrl);
      setPhotoFile(null);
      setPhotoFileName(null);
      setLocation(payload.location);
      if (!isSignup) {
        setTemperament(sanitizedTemperament);
        setSpokenLanguages(completeLanguages);
        setPersistedSpokenLanguages(completeLanguages);
        profileBaselineRef.current = profileFormSnapshot({
          displayName,
          birthDate,
          bio,
          hasChildren,
          location: payload.location,
          countryCode,
          interests,
          gender: genderLocked ? gender : gender,
          temperament: sanitizedTemperament,
          languages: completeLanguages,
          photoName: null,
        });
        setProfileSaved(true);
        window.setTimeout(() => setProfileSaved(false), 4000);
      }
      onDone();
    } catch (err) {
      setError(userErrorMessage(err));
      if (!isSignup) scrollToField(profileSaveRef.current);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!confirmDelete) return;
    setDeleteAcknowledged(false);
  }, [confirmDelete]);

  const handleDeleteAccount = async () => {
    if (!deleteAcknowledged) return;
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
        <div className="animate-pulse text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  if (isSignup && membershipLoadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-white to-amber-50">
        <div className="w-full max-w-md bg-white rounded-3xl border border-rose-100 shadow-xl shadow-rose-100/40 p-8 text-center space-y-4">
          <p className="text-gray-800 text-sm leading-relaxed">
            {membershipLoadError}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            {t('common.retry')}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            {t('common.signOut')}
          </button>
        </div>
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
              {t('common.signOut')}
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
            highlightedOffer={highlightedOffer}
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 shadow-lg shadow-rose-200 mb-3 animate-pop">
            <Heart className="w-7 h-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('profile.title')}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {t('profile.subtitle')}
          </p>
          {status.is_founder && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <FounderBadge number={status.founder_number} />
            </div>
          )}
          {status.has_boost ? (
            <p className="text-xs font-medium text-[#8A6D1D] mt-2">
              {status.boost_ends_at
                ? t('membership.boostUntil', { date: formatBoostUntil(status.boost_ends_at).date })
                : t('membership.boostActive')}
            </p>
          ) : null}
        </div>

        <form
          id="profile-setup-form"
          onSubmit={handleSubmit}
          className={
            isSignup
              ? 'bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8 space-y-6'
              : undefined
          }
        >
          <div
            className={
              isSignup
                ? 'contents'
                : 'bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-rose-100 p-6 sm:p-8 space-y-6'
            }
          >
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100 flex items-center justify-center flex-shrink-0 border-2 border-rose-100">
              {photoPreview || photoUrl ? (
                <img
                  src={photoPreview || photoUrl}
                  alt={t('profile.photoPreview')}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera className="w-7 h-7 text-rose-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('profile.photo')}
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
                    ? t('profile.photoChange')
                    : t('profile.photoChoose')}
                </button>
                {photoFile && (
                  <button
                    type="button"
                    onClick={clearSelectedPhoto}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-400 truncate">
                {photoFileName
                  ? photoFileName
                  : t('profile.photoFormatsHint')}
              </p>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Display name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {t('profile.displayName')} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400"
              placeholder={t('profile.displayNamePlaceholder')}
            />
          </div>

          {/* Birth date */}
          <div ref={birthFieldRef}>
            <label
              htmlFor="profile-birth-date-year"
              className="block text-sm font-semibold text-gray-700 mb-1.5"
            >
              {t('auth.birthDate')} <span className="text-rose-500">*</span>
            </label>
            <BirthDatePicker
              id="profile-birth-date"
              required
              value={birthDate}
              maxAgeDate={latestBirthDateForAge(MIN_USER_AGE)}
              onChange={(next) => {
                setBirthDate(next);
                setBirthError(null);
              }}
            />
            {birthError && (
              <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{birthError}</span>
              </p>
            )}
          </div>

          {/* Genre obligatoire. Une fois Homme/Femme enregistré, le bloc disparaît (immuable). */}
          {!genderLocked && (
            <div ref={genderFieldRef}>
              <p className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('profile.gender')} <span className="text-rose-500">*</span>
              </p>
              <div
                className="flex gap-2"
                role="group"
                aria-label={t('profile.gender')}
                aria-required="true"
              >
                <button
                  type="button"
                  aria-pressed={gender === 'homme'}
                  onClick={() => {
                    setGender('homme');
                    setGenderError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    gender === 'homme'
                      ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-500'
                  }`}
                >
                  {t('profile.genderMale')}
                </button>
                <button
                  type="button"
                  aria-pressed={gender === 'femme'}
                  onClick={() => {
                    setGender('femme');
                    setGenderError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    gender === 'femme'
                      ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-500'
                  }`}
                >
                  {t('profile.genderFemale')}
                </button>
              </div>
              {genderError && (
                <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{genderError}</span>
                </p>
              )}
            </div>
          )}

          {/* Location */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="profile-country"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                {t('profile.country')} <span className="text-rose-500">*</span>
              </label>
              <select
                id="profile-country"
                value={countryCode}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setCountryCode(next);
                  setLocation('');
                  setSelectedCity(null);
                  setSelectedWorldCity(null);
                  setCityError(null);
                }}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              >
                {COUNTRY_SELECT_OPTIONS.map((row) => (
                  <option key={row.iso2} value={row.iso2}>
                    {countryDisplayName(row.iso2)}
                  </option>
                ))}
              </select>
            </div>
            <div ref={cityFieldRef}>
              <label
                htmlFor="profile-city"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                {t('profile.city')} <span className="text-rose-500">*</span>
              </label>
              {countryCode === 'FR' ? (
                <CityAutocomplete
                  id="profile-city"
                  value={location}
                  onChange={(next) => {
                    setLocation(next);
                    setCityError(null);
                    setError((prev) =>
                      prev === citySelectionRequiredError() ? null : prev
                    );
                  }}
                  selected={selectedCity}
                  onSelect={(commune) => {
                    setSelectedCity(commune);
                    if (commune) {
                      setCityError(null);
                      setError((prev) =>
                        prev === citySelectionRequiredError() ? null : prev
                      );
                    }
                  }}
                  invalid={Boolean(cityError)}
                  placeholder={t('profile.cityPlaceholder')}
                />
              ) : (
                <WorldCityAutocomplete
                  id="profile-city"
                  countryCode={countryCode}
                  value={location}
                  onChange={(next) => {
                    setLocation(next);
                    setCityError(null);
                    setError((prev) =>
                      prev === citySelectionRequiredError() ? null : prev
                    );
                  }}
                  selected={selectedWorldCity}
                  onSelect={(city) => {
                    setSelectedWorldCity(city);
                    if (city) {
                      setCityError(null);
                      setError((prev) =>
                        prev === citySelectionRequiredError() ? null : prev
                      );
                    }
                  }}
                  invalid={Boolean(cityError)}
                  placeholder={t('profile.cityPlaceholder')}
                />
              )}
              {cityError && (
                <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{cityError}</span>
                </p>
              )}
            </div>
          </div>

          {/* Has children */}
          <div
            ref={childrenFieldRef}
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200"
          >
            <div className="flex items-start gap-3">
              <Baby className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('profile.hasChildren')}
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
                    {t('profile.no')}
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
                    {t('profile.yes')}
                  </button>
                </div>
                {hasChildren && (
                  <p className="text-xs text-rose-600 mt-2 flex items-center gap-1 animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('profile.childfreeOnly')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Interests */}
          <div ref={interestsFieldRef} className="space-y-4">
            <label className="block text-sm font-semibold text-gray-700">
              {t('profile.interests')}
            </label>
            {interestsError && (
              <p className="text-xs text-red-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{interestsError}</span>
              </p>
            )}

            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-rose-50/60 border border-rose-100">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="temperament-chip temperament-chip--on"
                  >
                    {displayInterest(interest)}
                    <button
                      type="button"
                      onClick={() => removeInterest(interest)}
                      className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
                      aria-label={t('profile.removeInterest', { name: displayInterest(interest) })}
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
                    {categoryLabel(category.id)}
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
                          aria-pressed={selected}
                          onClick={() => toggleInterest(interest)}
                          className={`temperament-chip ${
                            selected ? 'temperament-chip--on' : ''
                          }`}
                        >
                          {displayInterest(interest)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                {t('profile.addCustom')}
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
                  placeholder={t('profile.customInterestPlaceholder')}
                />
                <button
                  type="button"
                  onClick={addCustomInterest}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  {t('profile.add')}
                </button>
              </div>
            </div>
          </div>

          {/* Bio (optionnelle) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {t('profile.bio')}{' '}
              <span className="font-normal text-gray-400">{t('profile.bioOptional')}</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-900 placeholder-gray-400 resize-none"
              placeholder={t('profile.bioPlaceholder')}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {bio.length}/500
            </p>
          </div>

          {isSignup && (
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
                {t('profile.preferences')}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                {t('profile.emailPrefsHint')}
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
                  {t('profile.emailNotifications')}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {t('profile.emailPrefsLegal')}
                </span>
                {(prefsSaving || prefsSaved) && (
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${
                      prefsSaved ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    {prefsSaving ? (
                      t('profile.savingPref')
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        {t('profile.preferenceSaved')}
                      </>
                    )}
                  </span>
                )}
              </span>
            </label>
          </div>
          )}

          {isSignup && error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isSignup && (
          <button
            type="submit"
            disabled={
              saving ||
              hasChildren ||
              (!genderLocked && gender !== 'homme' && gender !== 'femme')
            }
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving
              ? photoFile
                ? t('profile.uploadingPhoto')
                : t('profile.saving')
              : t('profile.saveProfile')}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
          )}
          </div>
          {!isSignup && (
            <>
              <TemperamentProfileCard
                gender={gender}
                selected={temperament}
                onToggle={(key) => {
                  setProfileSaved(false);
                  setTemperamentError(null);
                  setTemperament((prev) => toggleTemperamentKey(prev, key));
                }}
                error={temperamentError}
                cardRef={temperamentCardRef}
              />
              <SpokenLanguagesProfileCard
                countryCode={countryCode}
                drafts={spokenLanguages}
                onChange={(next) => {
                  setProfileSaved(false);
                  setLanguagesError(null);
                  setSpokenLanguages(next);
                }}
                persistedLanguages={persistedSpokenLanguages}
                error={languagesError}
                cardRef={languagesCardRef}
              />
              <div ref={profileSaveRef} className="mt-6 space-y-3">
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm animate-fadeIn">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={
                    saving ||
                    hasChildren ||
                    (!genderLocked && gender !== 'homme' && gender !== 'femme')
                  }
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {photoFile
                        ? t('profile.uploadingPhoto')
                        : t('profile.saving')}
                    </>
                  ) : (
                    <>
                      {t('profile.saveProfile')}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                {profileSaved && (
                  <span className="inline-flex items-center justify-center gap-1 w-full text-sm font-medium text-emerald-700">
                    <Check className="w-4 h-4" />
                    {t('profile.saved')}
                  </span>
                )}
              </div>
            </>
          )}
        </form>
          </>
        )}
        {allowAccountDeletion && <ChangePasswordSection />}
        {allowAccountDeletion && (
          <EmailNotificationsProfileCard
            initialEnabled={emailNotificationsEnabled}
            hinted={prefsHint}
            cardRef={preferencesRef}
          />
        )}
        {allowAccountDeletion && <PwaInstallCard />}

        {allowAccountDeletion && (
          <div className="mt-4 bg-white rounded-3xl shadow-xl shadow-rose-100/50 border border-red-100 p-6 sm:p-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">{t('profile.deleteAccountTitle')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('profile.deleteAccountBody')}
            </p>

            <button
              type="button"
              onClick={() => {
                setDeleteAcknowledged(false);
                setConfirmDelete(true);
              }}
              className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {t('profile.deleteAccountCta')}
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
                    {t('common.attention')}
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {t('profile.deleteConfirmFounder')}
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteAcknowledged}
                      onChange={(e) =>
                        setDeleteAcknowledged(e.target.checked)
                      }
                      className="mt-1 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                    />
                    <span className="text-sm text-gray-700 leading-relaxed">
                      {t('profile.deleteAcknowledge')}
                    </span>
                  </label>
                  <div className="delete-confirm-actions flex gap-3 pt-1 items-stretch">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 min-w-0 basis-0 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60 flex items-center justify-center text-center"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleting || !deleteAcknowledged}
                      aria-label={
                        deleting
                          ? t('profile.deleting')
                          : t('profile.confirmDeletion')
                      }
                      className={`delete-confirm-btn flex-1 min-w-0 basis-0 py-3 rounded-xl font-semibold flex items-center justify-center${
                        deleteAcknowledged ? ' delete-confirm-btn--ready' : ''
                      }`}
                    >
                      {deleting ? (
                        t('profile.deleting')
                      ) : deleteAcknowledged ? (
                        <span className="text-center leading-snug" aria-hidden>
                          <span className="font-extrabold [-webkit-text-stroke:0.5px_currentColor]">
                            {t('common.confirmUpper')}
                          </span>
                          <br />
                          {t('profile.confirmDeletionLine')}
                        </span>
                      ) : (
                        <span className="text-center leading-snug" aria-hidden>
                          {t('common.confirm')}
                          <br />
                          {t('profile.confirmDeletionLine')}
                        </span>
                      )}
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
