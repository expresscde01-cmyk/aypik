import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROFILE_PUBLIC_COLUMNS,
  PROFILE_WRITE_RETURN,
  profileSaveErrorKey,
} from './profileSaveError.ts';

test('23505 sur le téléphone devient un message d’unicité', () => {
  assert.equal(
    profileSaveErrorKey({
      code: '23505',
      message: 'duplicate key value violates unique constraint "users_phone_key"',
    }),
    'errors.phoneExists'
  );
});

test('42501 sur profiles n’est plus une erreur générique', () => {
  assert.equal(
    profileSaveErrorKey({
      code: '42501',
      message: 'permission denied for table profiles',
    }),
    'errors.profileSaveDenied'
  );
});

test('le retour d’écriture est la liste publique, sans date de naissance', () => {
  assert.equal(PROFILE_WRITE_RETURN, PROFILE_PUBLIC_COLUMNS);
  const columns = PROFILE_PUBLIC_COLUMNS.split(',').map((name) => name.trim());
  assert.equal(columns.includes('birth_date'), false);
  assert.equal(columns.includes('lat'), false);
  assert.equal(columns.includes('email_notifications_enabled'), false);
  assert.equal(columns.length, 16);
});

test('23502 signale un champ obligatoire manquant', () => {
  assert.equal(
    profileSaveErrorKey({
      code: '23502',
      message: 'null value in column "birth_date" of relation "profiles" violates not-null constraint',
    }),
    'errors.profileFieldRequired'
  );
});
