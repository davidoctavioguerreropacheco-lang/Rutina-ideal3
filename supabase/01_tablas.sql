-- =====================================================================
-- Tracker de Entrenamiento - Etapa 1: tablas de la base de datos
-- Pégalo completo en Supabase > SQL Editor > New query > Run.
-- Se puede correr más de una vez sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla sessions: una fila por día entrenado
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,                       -- día real en que entrenaste
  dia        text not null
             check (dia in ('miercoles', 'jueves', 'sabado', 'domingo')),
  terminada  boolean not null default false,      -- si presionaste "Terminar sesión"
  creada_en  timestamptz not null default now()   -- para ordenar cronológicamente
);

-- ---------------------------------------------------------------------
-- 2) Tabla set_logs: una fila por serie
-- ---------------------------------------------------------------------
create table if not exists public.set_logs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  exercise_id text not null,                      -- ej. 'press_inclinado'
  set_number  smallint not null check (set_number between 1 and 4),
  reps        smallint check (reps >= 0),         -- vacío en plancha
  seconds     smallint check (seconds >= 0),      -- solo plancha
  weight_kg   numeric(5,2) check (weight_kg >= 0),-- kilos por mancuerna
  bands       smallint check (bands between 1 and 6),
  done        boolean not null default false,     -- si marcaste la palomita
  updated_at  timestamptz not null default now(), -- última edición

  -- Regla del documento: nunca dos filas con la misma sesión + ejercicio + serie.
  -- Guardar = crear o actualizar ESA fila. Así corregir nunca duplica.
  constraint set_logs_unica unique (session_id, exercise_id, set_number)
);

-- Índice para buscar rápido "la última vez que hice este ejercicio"
create index if not exists set_logs_exercise_idx on public.set_logs (exercise_id);

-- ---------------------------------------------------------------------
-- 3) updated_at se actualiza solo cada vez que se edita una serie
-- ---------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_logs_updated_at on public.set_logs;
create trigger set_logs_updated_at
  before update on public.set_logs
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- 4) Permisos: la página (rol "anon") puede leer, crear y editar
--    SOLO en estas dos tablas. No puede borrar.
-- ---------------------------------------------------------------------
revoke all on public.sessions from anon, authenticated;
revoke all on public.set_logs from anon, authenticated;

grant select, insert, update on public.sessions to anon;
grant select, insert, update on public.set_logs to anon;
grant all on public.sessions to service_role;
grant all on public.set_logs to service_role;

-- ---------------------------------------------------------------------
-- 5) Seguridad a nivel de fila (RLS) + políticas
-- ---------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.set_logs enable row level security;

drop policy if exists "pagina lee sesiones"     on public.sessions;
drop policy if exists "pagina crea sesiones"    on public.sessions;
drop policy if exists "pagina edita sesiones"   on public.sessions;
drop policy if exists "pagina lee series"       on public.set_logs;
drop policy if exists "pagina crea series"      on public.set_logs;
drop policy if exists "pagina edita series"     on public.set_logs;

create policy "pagina lee sesiones"   on public.sessions for select to anon using (true);
create policy "pagina crea sesiones"  on public.sessions for insert to anon with check (true);
create policy "pagina edita sesiones" on public.sessions for update to anon using (true) with check (true);

create policy "pagina lee series"     on public.set_logs for select to anon using (true);
create policy "pagina crea series"    on public.set_logs for insert to anon with check (true);
create policy "pagina edita series"   on public.set_logs for update to anon using (true) with check (true);
