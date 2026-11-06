import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileCompletionPercent } from './profileCompletion.ts';

const complete = {
  display_name: 'Camille',
  photo_url: 'https://example.test/photo.jpg',
  bio: 'Quelques mots.',
  location: 'Lyon (69001)',
  gender: 'femme',
  birth_date: '1990-04-02',
  interests: ['Cinéma', 'Voyage', 'Cuisine'],
  temperament: ['calme'],
  languages: [{ code: 'fr', level: 'natif' }],
};

test('aucun pourcentage sans profil chargé', () => {
  assert.equal(profileCompletionPercent(null), null);
  assert.equal(profileCompletionPercent(undefined), null);
});

test('un profil vide vaut 0, un profil rempli vaut 100', () => {
  assert.equal(profileCompletionPercent({}), 0);
  assert.equal(profileCompletionPercent(complete), 100);
});

test('moins de 3 centres d’intérêt ne remplit pas cette case', () => {
  assert.equal(
    profileCompletionPercent({ ...complete, interests: ['Cinéma', 'Voyage'] }),
    89
  );
  assert.equal(
    profileCompletionPercent({ ...complete, interests: ['Cinéma', 'Voyage', 'Cuisine'] }),
    100
  );
});

test('les espaces et les listes vides ne comptent pas', () => {
  assert.equal(
    profileCompletionPercent({
      ...complete,
      display_name: '   ',
      photo_url: '',
      temperament: [],
      languages: [],
    }),
    56
  );
});
