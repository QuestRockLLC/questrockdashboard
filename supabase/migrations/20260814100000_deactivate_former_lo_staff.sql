-- Deactivate former loan officers (no longer with QuestRock).
-- Safe to re-run.

UPDATE public.users
SET is_active = false, updated_at = NOW()
WHERE lower(email) IN ('scurry@questrock.com', 'jsherard@questrock.com');

DELETE FROM public.team_members tm
USING public.users u
WHERE tm.user_id = u.id
  AND lower(u.email) IN ('scurry@questrock.com', 'jsherard@questrock.com');

UPDATE public.users
SET primary_team_id = NULL, updated_at = NOW()
WHERE lower(email) IN ('scurry@questrock.com', 'jsherard@questrock.com');
