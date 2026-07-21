-- Shape report email run log — idempotency, audit, and pilot monitoring.
create table if not exists public.shape_report_runs (
  id               uuid primary key default gen_random_uuid(),
  run_id           text not null unique,
  cadence          text not null check (cadence in ('morning_lo', 'daily', 'weekly', 'monthly')),
  recipient_group  text not null default 'pilot_nikk',
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  status           text not null check (status in ('queued', 'sent', 'failed')),
  payload_hash     text null,
  lead_count       int null,
  error            text null,
  zapier_status    int null,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz null,
  unique (cadence, period_start, recipient_group)
);

create index if not exists shape_report_runs_created_at_idx
  on public.shape_report_runs (created_at desc);

create index if not exists shape_report_runs_status_idx
  on public.shape_report_runs (status, created_at desc);

alter table public.shape_report_runs enable row level security;

drop policy if exists shape_report_runs_select on public.shape_report_runs;
create policy shape_report_runs_select
  on public.shape_report_runs for select
  using (public.current_user_role() in ('executive', 'admin'));

comment on table public.shape_report_runs is
  'Audit log for Shape-sourced email reports delivered via Zapier (pilot: Nikk only).';
