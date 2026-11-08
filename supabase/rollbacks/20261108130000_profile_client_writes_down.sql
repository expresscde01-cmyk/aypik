-- Retour arrière de 20261108130000_profile_client_writes.
-- À lancer à la main seulement. supabase db push ne l'applique pas.

DROP TRIGGER IF EXISTS profiles_enforce_client_update ON public.profiles;
DROP FUNCTION IF EXISTS public.enforce_profile_client_update();

GRANT UPDATE ON TABLE public.profiles TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_open_messaging_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_open_messaging_profile(uuid) IS
  'Vrai si ce membre a choisi d''accepter les messages sans Match.';

NOTIFY pgrst, 'reload schema';
