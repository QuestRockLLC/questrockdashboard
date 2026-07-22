-- LendingPad Critical Dates → dashboard milestone labels (Package Out / Package Back / Validation)
alter table public.loans add column if not exists application_taken_at timestamptz null;
alter table public.loans add column if not exists le_issued_at timestamptz null;
alter table public.loans add column if not exists intent_to_proceed_at timestamptz null;
alter table public.loans add column if not exists lp_processing_at timestamptz null;

comment on column public.loans.application_taken_at is 'LP Critical Dates > Application Taken (Interviewer Details)';
comment on column public.loans.le_issued_at is 'LP Critical Dates > LE Issued — package is out once populated';
comment on column public.loans.intent_to_proceed_at is 'LP Critical Dates > Intent to Proceed — package is back once populated';
comment on column public.loans.lp_processing_at is 'LP Critical Dates > Processing — dashboard shows Validation';
