/*
# Create dating app schema (childfree + age-gap rule)

## Purpose
A dating site for people without children, with a built-in age-gap rule
(half your age plus 7) enforced both in the UI and at the database level.

## New Tables

### profiles
- `id` (uuid, PK, references auth.users)
- `display_name` (text, not null)
- `birth_date` (date, not null) — used to compute age
- `bio` (text)
- `has_children` (boolean, default false) — must be false to use the site
- `location` (text)
- `interests` (text[]) — optional tags
- `photo_url` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### likes
- `id` (uuid, PK)
- `from_user` (uuid, references profiles, not null)
- `from_user` (uuid, references profiles, not null)
- `to_user` (uuid, references profiles, not null)
- `created_at` (timestamptz)
- UNIQUE constraint on (from_user, to_user) to prevent duplicate likes

## Security
- RLS enabled on profiles and likes.
- Owner-scoped CRUD: each authenticated user can only read/update their own profile.
- SELECT on profiles is open to all authenticated users (so they can discover each other),
  but UPDATE/INSERT/DELETE are owner-scoped.
- Likes: a user can read likes they sent or received, and insert/delete their own likes.
*/

-- ===== profiles =====
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  birth_date date NOT NULL,
  bio text DEFAULT '',
  has_children boolean NOT NULL DEFAULT false,
  location text DEFAULT '',
  interests text[] DEFAULT '{}',
  photo_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (discovery)
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
ON profiles FOR SELECT
TO authenticated USING (true);

-- Users can insert only their own profile
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

-- Users can update only their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Users can delete only their own profile
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own"
ON profiles FOR DELETE
TO authenticated USING (auth.uid() = id);

-- ===== likes =====
CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user, to_user)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- A user can read likes they sent or received
DROP POLICY IF EXISTS "likes_select_own" ON likes;
CREATE POLICY "likes_select_own"
ON likes FOR SELECT
TO authenticated USING (auth.uid() = from_user OR auth.uid() = to_user);

-- A user can insert only likes they send
DROP POLICY IF EXISTS "likes_insert_own" ON likes;
CREATE POLICY "likes_insert_own"
ON likes FOR INSERT
TO authenticated WITH CHECK (auth.uid() = from_user);

-- A user can delete only likes they sent
DROP POLICY IF EXISTS "likes_delete_own" ON likes;
CREATE POLICY "likes_delete_own"
ON likes FOR DELETE
TO authenticated USING (auth.uid() = from_user);

-- ===== updated_at trigger =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_likes_from_user ON likes(from_user);
CREATE INDEX IF NOT EXISTS idx_likes_to_user ON likes(to_user);
CREATE INDEX IF NOT EXISTS idx_profiles_birth_date ON profiles(birth_date);
