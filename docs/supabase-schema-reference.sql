-- ============================================================
-- Tax Forensics — Supabase Schema
-- Run this in the Supabase SQL Editor once to initialize.
-- ============================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Clients ──────────────────────────────────────────────────────────────────
create table if not exists clients (
  id           uuid primary key default uuid_generate_v4(),
  preparer_id  uuid references auth.users(id) on delete cascade not null,
  first_name   text not null,
  last_name    text not null,
  email        text,
  phone        text,
  ssn_last4    text,  -- store ONLY last 4 digits
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── Tax Returns ──────────────────────────────────────────────────────────────
create table if not exists tax_returns (
  id                      uuid primary key default uuid_generate_v4(),
  client_id               uuid references clients(id) on delete cascade not null,
  tax_year                integer not null,
  status                  text not null default 'draft'
                            check (status in (
                              'draft','documents_requested','questionnaire_sent',
                              'in_progress','under_review','complete'
                            )),
  workflow_state          jsonb not null default '{}'::jsonb,
  optimization_questions  jsonb not null default '[]'::jsonb,
  optimization_responses  jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(client_id, tax_year)
);

-- ─── Portal Tokens ────────────────────────────────────────────────────────────
-- Used for client-facing upload and questionnaire links (no auth required).
create table if not exists portal_tokens (
  id          uuid primary key default uuid_generate_v4(),
  return_id   uuid references tax_returns(id) on delete cascade not null,
  token       text unique not null default encode(gen_random_bytes(32), 'hex'),
  token_type  text not null check (token_type in ('upload', 'questionnaire')),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ─── Uploaded Documents (portal-submitted) ────────────────────────────────────
-- Tracks files uploaded by clients via the portal.
-- Actual file bytes live in Supabase Storage bucket "client-documents".
create table if not exists portal_uploads (
  id            uuid primary key default uuid_generate_v4(),
  return_id     uuid references tax_returns(id) on delete cascade not null,
  token_id      uuid references portal_tokens(id) on delete set null,
  storage_path  text not null,
  original_name text not null,
  file_size     bigint,
  uploaded_at   timestamptz not null default now()
);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
alter table clients       enable row level security;
alter table tax_returns   enable row level security;
alter table portal_tokens enable row level security;
alter table portal_uploads enable row level security;

-- Preparers can only see and manage their own clients
create policy "preparers_own_clients" on clients
  for all using (auth.uid() = preparer_id);

-- Preparers can see returns for their clients
create policy "preparers_own_returns" on tax_returns
  for all using (
    client_id in (
      select id from clients where preparer_id = auth.uid()
    )
  );

-- Preparers manage tokens on their returns
create policy "preparers_manage_tokens" on portal_tokens
  for all using (
    return_id in (
      select tr.id from tax_returns tr
      join clients c on tr.client_id = c.id
      where c.preparer_id = auth.uid()
    )
  );

-- Public: anyone can read a valid (non-expired, non-revoked) token
-- This allows portal pages to verify a link without requiring login
create policy "public_read_valid_tokens" on portal_tokens
  for select using (
    expires_at > now() and revoked_at is null
  );

-- Public: clients can insert uploads via a valid upload token
create policy "public_portal_uploads" on portal_uploads
  for insert with check (
    return_id in (
      select pt.return_id from portal_tokens pt
      where pt.token_type = 'upload'
        and pt.expires_at > now()
        and pt.revoked_at is null
    )
  );

-- Preparers can see uploads for their returns
create policy "preparers_see_uploads" on portal_uploads
  for select using (
    return_id in (
      select tr.id from tax_returns tr
      join clients c on tr.client_id = c.id
      where c.preparer_id = auth.uid()
    )
  );

-- ─── Storage Bucket ───────────────────────────────────────────────────────────
-- Run this separately in the Storage section of the Supabase dashboard:
--
--   1. Create a bucket named "client-documents"
--   2. Set it to PRIVATE (not public)
--   3. Add a storage policy:
--        - INSERT: authenticated users (preparers uploading on behalf of clients)
--        - INSERT: via service role (portal uploads using a server-side function)
--        - SELECT: authenticated users can read their own client files
--
-- For portal uploads, use a Supabase Edge Function to validate the token
-- and forward the file to storage with service-role credentials.
-- See: https://supabase.com/docs/guides/storage

-- ─── Useful indexes ───────────────────────────────────────────────────────────
create index if not exists idx_clients_preparer    on clients(preparer_id);
create index if not exists idx_returns_client      on tax_returns(client_id);
create index if not exists idx_tokens_return       on portal_tokens(return_id);
create index if not exists idx_tokens_token        on portal_tokens(token);
create index if not exists idx_uploads_return      on portal_uploads(return_id);

-- ─── Updated-at trigger ───────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create trigger returns_updated_at
  before update on tax_returns
  for each row execute function set_updated_at();
