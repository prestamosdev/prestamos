-- Multi-tenant: cada fila pertenece a un prestamista (lender_id = auth.uid()).
create extension if not exists "pgcrypto";

create table public.lenders (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references public.lenders(id) on delete cascade,
  name text not null,
  document_id text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references public.lenders(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  amount numeric not null check (amount > 0),
  interest_rate numeric not null check (interest_rate >= 0), -- % mensual
  interest_type text not null default 'french',
  frequency text not null check (frequency in ('daily','weekly','biweekly','monthly')),
  installments int not null check (installments > 0),
  status text not null default 'active' check (status in ('active','on_time','overdue','finished')),
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references public.lenders(id) on delete cascade,
  loan_id uuid not null references public.loans(id),
  amount_paid numeric not null check (amount_paid > 0),
  capital_portion numeric not null default 0,
  interest_portion numeric not null default 0,
  remaining_balance numeric not null,
  payment_date timestamptz not null default now(),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_audit (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references public.lenders(id) on delete cascade,
  payment_id uuid not null,
  action text not null check (action in ('edit','reverse')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index on public.clients(lender_id);
create index on public.loans(lender_id);
create index on public.loans(client_id);
create index on public.payments(lender_id);
create index on public.payments(loan_id);
create index on public.payment_audit(lender_id);
create index on public.clients(lender_id, updated_at);
create index on public.loans(lender_id, updated_at);
create index on public.payments(lender_id, updated_at);

-- RLS
alter table public.lenders enable row level security;
alter table public.clients enable row level security;
alter table public.loans enable row level security;
alter table public.payments enable row level security;
alter table public.payment_audit enable row level security;

create policy lenders_own on public.lenders for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy clients_own on public.clients for all to authenticated
  using (lender_id = (select auth.uid())) with check (lender_id = (select auth.uid()));

create policy loans_own on public.loans for all to authenticated
  using (lender_id = (select auth.uid())) with check (lender_id = (select auth.uid()));

create policy payments_own on public.payments for all to authenticated
  using (lender_id = (select auth.uid())) with check (lender_id = (select auth.uid()));

create policy audit_own on public.payment_audit for all to authenticated
  using (lender_id = (select auth.uid())) with check (lender_id = (select auth.uid()));

-- Crea el registro del prestamista al registrarse
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lenders(id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
