-- SpecPilot — model snapshot storage.
--
-- One append-only table. Each row is the complete, already-validated result of one
-- Bright Data collector run for one provider.
--
-- Why append-only rather than an upsert-able `models` table:
--   A refresh must never be able to damage the dataset that production is serving.
--   If nothing can be updated or deleted, then a failed or partial collection
--   simply does not produce a new healthy row, and the previous healthy row keeps
--   serving traffic. That guarantee is enforced here in the database, not merely
--   in application code.
--
-- Deliberately NOT stored anywhere: users' task descriptions or specifications.
-- They can contain private material and the product does not need them.

create extension if not exists "pgcrypto";

create table if not exists public.model_snapshots (
  id               uuid        primary key default gen_random_uuid(),
  provider         text        not null,
  collection_id    text,
  status           text        not null,
  collected_at     timestamptz not null,
  records_received integer     not null default 0,
  records_valid    integer     not null default 0,
  records_invalid  integer     not null default 0,
  -- Array of NormalizedModel, validated by Zod before insert and again on read.
  models           jsonb       not null,
  created_at       timestamptz not null default now(),

  constraint model_snapshots_status_check
    check (status in ('healthy', 'partial', 'failed')),
  -- A healthy snapshot must actually contain models. Belt-and-braces against an
  -- application bug inserting an empty dataset as healthy.
  constraint model_snapshots_healthy_has_models
    check (status <> 'healthy' or jsonb_array_length(models) > 0)
);

-- The read path is always "newest healthy snapshot for this provider".
create index if not exists model_snapshots_provider_status_collected_idx
  on public.model_snapshots (provider, status, collected_at desc);

-- ── Append-only enforcement ─────────────────────────────────────────────────
create or replace function public.model_snapshots_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'model_snapshots is append-only; insert a new snapshot instead of modifying %',
    tg_op;
end;
$$;

drop trigger if exists model_snapshots_no_update on public.model_snapshots;
create trigger model_snapshots_no_update
  before update on public.model_snapshots
  for each row execute function public.model_snapshots_reject_mutation();

drop trigger if exists model_snapshots_no_delete on public.model_snapshots;
create trigger model_snapshots_no_delete
  before delete on public.model_snapshots
  for each row execute function public.model_snapshots_reject_mutation();

-- ── Access control ──────────────────────────────────────────────────────────
-- RLS on with NO policies: anon and authenticated get nothing at all. Every read
-- and write goes through the server-only service-role client, which bypasses RLS.
alter table public.model_snapshots enable row level security;

revoke all on public.model_snapshots from anon;
revoke all on public.model_snapshots from authenticated;

comment on table public.model_snapshots is
  'Append-only Bright Data collector results. Server-side access only; no anonymous policy exists. Never stores user specifications.';
