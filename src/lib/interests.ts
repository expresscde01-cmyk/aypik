export type InterestCategory = {
  id: string;
  label: string;
  interests: string[];
};

/** Suggestions prédéfinies, regroupées par thème. */
export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    id: 'culture',
    label: 'Culture & divertissement',
    interests: [
      'Cinéma',
      'Séries',
      'Théâtre',
      'Concerts',
      'Musique',
      'Lecture',
      'BD & mangas',
      'Musées',
      'Expositions',
      'Podcasts',
      'Stand-up',
      'Danse',
    ],
  },
  {
    id: 'tech',
    label: 'Tech & numérique',
    interests: [
      'High-tech',
      'IA',
      'Gaming',
      'Programmation',
      'Science',
      'Astronomie',
      'Photo numérique',
      'Création de contenu',
      'Réseaux sociaux',
    ],
  },
  {
    id: 'creative',
    label: 'Loisirs créatifs',
    interests: [
      'Photographie',
      'Dessin',
      'Peinture',
      'Écriture',
      'DIY',
      'Couture',
      'Poterie',
      'Jardinage',
      'Cuisine',
      'Pâtisserie',
      'Décoration',
      'Instruments de musique',
    ],
  },
  {
    id: 'wellbeing',
    label: 'Bien-être & sport',
    interests: [
      'Yoga',
      'Méditation',
      'Fitness',
      'Course à pied',
      'Randonnée',
      'Vélo',
      'Natation',
      'Escalade',
      'Sports collectifs',
      'Arts martiaux',
      'Ski',
      'Surf',
      'Nutrition',
    ],
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle & sorties',
    interests: [
      'Voyage',
      'Road trips',
      'Restaurants',
      'Bars & cafés',
      'Vie nocturne',
      'Festivals',
      'Mode',
      'Shopping',
      'Animaux',
      'Nature',
      'Écologie',
      'Bénévolat',
    ],
  },
  {
    id: 'mind',
    label: 'Esprit & société',
    interests: [
      'Philosophie',
      'Histoire',
      'Politique',
      'Actualité',
      'Langues',
      'Développement personnel',
      'Entrepreneuriat',
      'Investissement',
      'Spiritualité',
    ],
  },
];

export const ALL_SUGGESTED_INTERESTS: string[] = INTEREST_CATEGORIES.flatMap(
  (c) => c.interests
);

export const MIN_INTERESTS = 3;
export const MAX_CUSTOM_INTEREST_LENGTH = 32;

export const INTERESTS_MIN_ERROR =
  'Sélectionne au moins 3 centres d’intérêt';

/** Normalise pour comparer sans doublon (casse / espaces). */
export function normalizeInterestKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
}

export function sanitizeCustomInterest(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (cleaned.length > MAX_CUSTOM_INTEREST_LENGTH) return null;
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;
  return cleaned;
}
