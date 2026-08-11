/*
# Allow users to delete their own account

Deletes the authenticated user from auth.users. Related rows in profiles
and likes are removed automatically via ON DELETE CASCADE.
*/

CREATE OR REPLACE FUNCTION delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid := auth.uid();
BEGIN
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_account() TO authenticated;
