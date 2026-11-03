create table categories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  name text not null,
  color text not null default 'indigo',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  category_id uuid references categories(id) on delete set null,
  title text not null default 'Untitled',
  content text not null default '',
  canvases jsonb not null default '{}',
  pads jsonb not null default '{}',
  view_mode text not null default 'document',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table categories enable row level security;
alter table notes enable row level security;
create policy "owner all" on categories for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner all" on notes for all using (owner = auth.uid()) with check (owner = auth.uid());

-- v1.1: private image storage. Each file lives under <owner id>/<note id>/ and only the owner can touch it.
insert into storage.buckets (id, name, public) values ('slate-images', 'slate-images', false) on conflict (id) do nothing;
drop policy if exists "owner images" on storage.objects;
create policy "owner images" on storage.objects for all to authenticated
  using (bucket_id = 'slate-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'slate-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- v1.2: a note can carry one PDF to read next to its canvas
alter table notes add column if not exists pdf jsonb;
