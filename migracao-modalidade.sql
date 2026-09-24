-- ========== DiagLaudos Gestao — adiciona Modalidade (Tomografia/Raio-X/Ressonancia/Mamografia) ==========

alter table dl_medicos drop column if exists valor_eletivo;
alter table dl_medicos drop column if exists valor_urgencia;
alter table dl_medicos drop column if exists valor_internados;

create table if not exists dl_valores (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references dl_medicos(id) on delete cascade,
  modalidade text not null check (modalidade in ('tomografia','raio_x','ressonancia','mamografia')),
  tipo text not null check (tipo in ('eletivo','urgencia','internados')),
  valor_unitario numeric(10,2) not null default 0,
  created_at timestamptz default now(),
  unique(medico_id, modalidade, tipo)
);
alter table dl_valores enable row level security;
create policy "admin gerencia valores dl" on dl_valores
  for all using (dl_is_admin()) with check (dl_is_admin());
create policy "medico ve os proprios valores dl" on dl_valores
  for select using (medico_id = dl_meu_medico_id());

alter table dl_laudos add column if not exists modalidade text;
alter table dl_laudos drop constraint if exists dl_laudos_modalidade_check;
alter table dl_laudos add constraint dl_laudos_modalidade_check check (modalidade in ('tomografia','raio_x','ressonancia','mamografia'));
