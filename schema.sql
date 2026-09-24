-- ========== DiagLaudos Gestao — mesmo projeto Supabase compartilhado, tabelas prefixadas dl_ ==========

create table if not exists dl_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  role text not null default 'medico' check (role in ('admin','medico')),
  medico_id uuid,
  created_at timestamptz default now()
);
alter table dl_profiles enable row level security;

create table if not exists dl_medicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  valor_eletivo numeric(10,2) not null default 0,
  valor_urgencia numeric(10,2) not null default 0,
  valor_internados numeric(10,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz default now()
);
alter table dl_medicos enable row level security;

alter table dl_profiles add constraint dl_profiles_medico_fk foreign key (medico_id) references dl_medicos(id) on delete set null;

create table if not exists dl_unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz default now()
);
alter table dl_unidades enable row level security;

create table if not exists dl_laudos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  medico_id uuid not null references dl_medicos(id) on delete restrict,
  unidade_id uuid not null references dl_unidades(id) on delete restrict,
  tipo text not null check (tipo in ('eletivo','urgencia','internados')),
  quantidade int not null check (quantidade > 0),
  valor_unitario numeric(10,2) not null,
  valor_total numeric(10,2) not null,
  criado_por uuid references auth.users(id),
  created_at timestamptz default now()
);
create index if not exists idx_dl_laudos_medico on dl_laudos(medico_id);
create index if not exists idx_dl_laudos_unidade on dl_laudos(unidade_id);
create index if not exists idx_dl_laudos_data on dl_laudos(data);
alter table dl_laudos enable row level security;

create table if not exists dl_recebimentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references dl_unidades(id) on delete restrict,
  competencia date not null,
  vencimento date,
  valor numeric(10,2) not null default 0,
  data_recebimento date,
  status text not null default 'pendente' check (status in ('pendente','recebido','atrasado')),
  observacoes text,
  created_at timestamptz default now()
);
alter table dl_recebimentos enable row level security;

create table if not exists dl_pagamentos_status (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references dl_medicos(id) on delete cascade,
  competencia date not null,
  status text not null default 'pendente' check (status in ('pendente','pago')),
  data_pagamento date,
  created_at timestamptz default now(),
  unique(medico_id, competencia)
);
alter table dl_pagamentos_status enable row level security;

-- Funcao auxiliar (security definer) para checar se o usuario logado e admin, sem recursao de RLS
create or replace function public.dl_is_admin()
returns boolean
language sql security definer set search_path = public
as $$
  select exists(select 1 from dl_profiles where id = auth.uid() and role = 'admin');
$$;
grant execute on function public.dl_is_admin() to authenticated;

create or replace function public.dl_meu_medico_id()
returns uuid
language sql security definer set search_path = public
as $$
  select medico_id from dl_profiles where id = auth.uid();
$$;
grant execute on function public.dl_meu_medico_id() to authenticated;

-- dl_profiles
create policy "usuario ve o proprio perfil ou admin ve todos" on dl_profiles
  for select using (auth.uid() = id or dl_is_admin());
create policy "usuario cria o proprio perfil no cadastro" on dl_profiles
  for insert with check (auth.uid() = id);
create policy "usuario atualiza o proprio nome, admin atualiza tudo" on dl_profiles
  for update using (auth.uid() = id or dl_is_admin());

-- dl_medicos
create policy "admin gerencia medicos" on dl_medicos
  for all using (dl_is_admin()) with check (dl_is_admin());
create policy "medico ve o proprio cadastro" on dl_medicos
  for select using (id = dl_meu_medico_id());

-- dl_unidades
create policy "admin gerencia unidades" on dl_unidades
  for all using (dl_is_admin()) with check (dl_is_admin());
create policy "usuario logado ve unidades ativas" on dl_unidades
  for select using (auth.uid() is not null);

-- dl_laudos
create policy "admin ve e gerencia todos os laudos" on dl_laudos
  for all using (dl_is_admin()) with check (dl_is_admin());
create policy "medico ve os proprios laudos" on dl_laudos
  for select using (medico_id = dl_meu_medico_id());
create policy "medico lanca os proprios laudos" on dl_laudos
  for insert with check (medico_id = dl_meu_medico_id());

-- dl_recebimentos (somente admin)
create policy "admin gerencia recebimentos" on dl_recebimentos
  for all using (dl_is_admin()) with check (dl_is_admin());

-- dl_pagamentos_status
create policy "admin gerencia status de pagamento" on dl_pagamentos_status
  for all using (dl_is_admin()) with check (dl_is_admin());
create policy "medico ve o proprio status de pagamento" on dl_pagamentos_status
  for select using (medico_id = dl_meu_medico_id());

-- Primeiro admin (Alessandra) - rode este bloco DEPOIS de ela criar a conta pelo login.html
-- update dl_profiles set role = 'admin', nome = 'Alessandra Abreu' where id = (select id from auth.users where email = 'alessandra.a.abreu@gmail.com');
