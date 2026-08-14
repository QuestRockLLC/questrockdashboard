#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"
EMAIL="krockey@questrock.com"
FULL_NAME="Kerry Rockey"
ROLE="processor"
PASSWORD="${1:-WelcomeToQuestRock1!}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^# ]] && continue
  if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]// /}"
    value="${BASH_REMATCH[2]}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
  fi
done < "$ENV_FILE"

if [[ -z "${NIKK_ALL_SESSION_POOLER_PASSWORD:-}" ]]; then
  echo "Missing NIKK_ALL_SESSION_POOLER_PASSWORD in .env.local" >&2
  exit 1
fi

export PGPASSWORD="$NIKK_ALL_SESSION_POOLER_PASSWORD"

CORE_NEW="postgresql://postgres.anypkkcxqiwvwcvvebch@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
CORE_OLD="postgresql://postgres.fyuuvpytoexsvgoomxbf@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
INCOME_NEW="postgresql://postgres.nycgnjbydxpwmgnwnwxg@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
CREDIT_NEW="postgresql://postgres.qfvdkhqeswxmmwsfgnzr@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
CREDIT_OLD="postgresql://postgres.frmygdqoefllslmzthzy@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

EMAIL_SQL="$(sql_escape "$EMAIL")"
FULL_NAME_SQL="$(sql_escape "$FULL_NAME")"
PASSWORD_SQL="$(sql_escape "$PASSWORD")"
ROLE_SQL="$(sql_escape "$ROLE")"

run_auth_sql() {
  local conn="$1"
  psql "$conn" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  v_email text := lower(trim('${EMAIL_SQL}'));
  v_full_name text := trim('${FULL_NAME_SQL}');
  v_password text := '${PASSWORD_SQL}';
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      NOW(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name, 'email_verified', true),
      NOW(),
      NOW(),
      false,
      false
    );

    INSERT INTO auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', false,
        'phone_verified', false
      ),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      instance_id = '00000000-0000-0000-0000-000000000000',
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', v_full_name, 'email_verified', true),
      updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  RAISE NOTICE 'auth_user_id=%', v_user_id;
END \$\$;
SQL
}

run_core_profile_sql() {
  psql "$CORE_NEW" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  v_email text := lower(trim('${EMAIL_SQL}'));
  v_full_name text := trim('${FULL_NAME_SQL}');
  v_role text := trim('${ROLE_SQL}');
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
END \$\$;
SQL
}

run_legacy_core_profile_sql() {
  psql "$CORE_OLD" -v ON_ERROR_STOP=1 <<SQL || echo "WARN: legacy core pooler unavailable; use provision-hub-user.js for legacy core"
DO \$\$
DECLARE
  v_email text := lower(trim('${EMAIL_SQL}'));
  v_full_name text := trim('${FULL_NAME_SQL}');
  v_role text := trim('${ROLE_SQL}');
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth user not found for %', v_email;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
    UPDATE public.users
    SET email = v_email, full_name = v_full_name, role = v_role::app_role, is_active = true, updated_at = NOW()
    WHERE id = v_user_id;
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_email) THEN
    UPDATE public.users
    SET id = v_user_id, full_name = v_full_name, role = v_role::app_role, is_active = true, updated_at = NOW()
    WHERE lower(email) = v_email;
  ELSE
    INSERT INTO public.users (id, email, full_name, role, is_active)
    VALUES (v_user_id, v_email, v_full_name, v_role::app_role, true);
  END IF;

  RAISE NOTICE 'legacy_core_profile_ok user_id=% role=%', v_user_id, v_role;
END \$\$;
SQL
}

echo "== Core (new) $EMAIL =="
run_auth_sql "$CORE_NEW"
run_core_profile_sql

echo "== Core (legacy) $EMAIL =="
run_auth_sql "$CORE_OLD" || echo "WARN: legacy core auth SQL skipped"
run_legacy_core_profile_sql

echo "== Income Bot (new) $EMAIL =="
run_auth_sql "$INCOME_NEW"

echo "== Credit Repair (new) $EMAIL =="
run_auth_sql "$CREDIT_NEW"

echo "== Credit Repair (legacy) $EMAIL =="
run_auth_sql "$CREDIT_OLD" || echo "WARN: legacy credit repair DB unavailable (expected after cutover)"

echo "Done."
