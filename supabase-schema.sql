-- Run once in the Supabase SQL editor before deploying.
create table if not exists employees (
  id uuid primary key default gen_random_uuid(), name text unique not null,
  telegram_user_id text unique, telegram_chat_id text
);
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(), reference text unique not null,
  kind text not null check (kind in ('sale','expense')), submitted_by uuid references employees(id),
  submitter_name text not null, source text not null, origin_chat_id text, customer text,
  description text not null, project text, proposed_project text, final_project text,
  category text, amount numeric(12,2) not null check (amount > 0),
  proposed_richard numeric(5,2) default 0, proposed_anastasia numeric(5,2) default 0,
  proposed_jean_claude numeric(5,2) default 0, final_richard numeric(5,2),
  final_anastasia numeric(5,2), final_jean_claude numeric(5,2), commission_pool numeric(12,2) default 0,
  commission_richard numeric(12,2) default 0, commission_anastasia numeric(12,2) default 0,
  commission_jean_claude numeric(12,2) default 0, status text not null, manager_note text,
  manager_changed boolean default false, decided_at timestamptz, decided_by uuid references employees(id),
  created_at timestamptz default now()
);
create table if not exists delivery_log (
  transaction_id uuid references transactions(id) on delete cascade, channel text not null,
  state text not null, detail text, updated_at timestamptz default now(),
  primary key (transaction_id, channel)
);
insert into employees(name) values ('Richard Darling'),('Anastasia Ferrari'),('Jean-Claude Bērziņš'),('Kevin von Whatever'),('Svetlana de Monte Carlo') on conflict (name) do nothing;
