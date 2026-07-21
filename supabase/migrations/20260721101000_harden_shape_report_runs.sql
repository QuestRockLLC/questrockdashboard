-- Service-role clients bypass RLS, so no permissive write policy is needed.
drop policy if exists shape_report_runs_service on public.shape_report_runs;
