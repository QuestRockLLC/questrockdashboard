-- Provision core Hub auth user + public.users profile.
-- Run after provision-auth-user.sql with same :email, :full_name, :role

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_email text := lower(trim(:'email'));
  v_full_name text := trim(:'full_name');
  v_role text := trim(:'role');
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth user not found for %', v_email;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
    UPDATE public.users
    SET email = v_email,
        full_name = v_full_name,
        role = v_role::app_role,
        is_active = true,
        updated_at = NOW()
    WHERE id = v_user_id;
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_email) THEN
    UPDATE public.users
    SET id = v_user_id,
        full_name = v_full_name,
        role = v_role::app_role,
        is_active = true,
        updated_at = NOW()
    WHERE lower(email) = v_email;
  ELSE
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (v_user_id, v_email, v_full_name, v_role::app_role, true);
  END IF;

  RAISE NOTICE 'core_profile_ok user_id=% role=%', v_user_id, v_role;
END $$;
