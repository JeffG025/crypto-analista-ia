-- ============================================================
-- CryptoMind — Esquema de base de datos (Supabase / PostgreSQL)
--
-- CÓMO USARLO:
-- 1. Crea tu proyecto en https://supabase.com (gratis)
-- 2. En el panel: SQL Editor → New query
-- 3. Pega TODO este archivo y presiona RUN
-- 4. Copia las credenciales en server/.env:
--    - SUPABASE_URL    → Settings → API → Project URL
--    - SUPABASE_SERVICE_KEY → Settings → API → service_role (secret)
-- ============================================================

-- ===== USUARIOS =====
create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text unique not null,
    password_hash text,
    google_id text,
    picture text,
    role text not null default 'free' check (role in ('free', 'premium', 'admin')),
    telegram_id bigint unique,
    telegram_username text,
    stripe_customer_id text,
    created_at timestamptz not null default now()
);

-- ===== ALERTAS (unificadas: web + telegram) =====
create table if not exists alerts (
    id bigint generated always as identity primary key,
    user_id uuid references users(id) on delete cascade,
    telegram_id bigint,
    telegram_chat_id bigint,
    coin_id text not null,
    coin_name text,
    coin_symbol text,
    condition text not null check (condition in ('above', 'below')),
    target_price numeric not null,
    source text not null default 'web' check (source in ('web', 'telegram')),
    triggered_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_alerts_active on alerts (triggered_at) where triggered_at is null;
create index if not exists idx_alerts_user on alerts (user_id);
create index if not exists idx_alerts_telegram on alerts (telegram_id);

-- ===== CÓDIGOS DE VINCULACIÓN TELEGRAM =====
create table if not exists link_codes (
    code text primary key,
    telegram_id bigint not null,
    telegram_username text,
    telegram_chat_id bigint,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

-- ===== USO DIARIO (límites por rol) =====
create table if not exists usage (
    user_id uuid not null references users(id) on delete cascade,
    action text not null,
    day date not null default current_date,
    count int not null default 0,
    primary key (user_id, action, day)
);

-- ===== PAGOS =====
create table if not exists payments (
    id bigint generated always as identity primary key,
    user_id uuid references users(id) on delete cascade,
    provider text not null default 'stripe',
    provider_session_id text,
    amount numeric,
    currency text,
    status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
    plan text,
    created_at timestamptz not null default now()
);

-- ===== FUNCIÓN: incrementar uso diario de forma atómica =====
create or replace function increment_usage(p_user_id uuid, p_action text)
returns int
language plpgsql
as $$
declare
    new_count int;
begin
    insert into usage (user_id, action, day, count)
    values (p_user_id, p_action, current_date, 1)
    on conflict (user_id, action, day)
    do update set count = usage.count + 1
    returning count into new_count;
    return new_count;
end;
$$;

-- NOTA: usamos la service_role key desde el servidor, que omite RLS.
-- Activamos RLS para que la clave pública (anon) NO pueda leer nada.
alter table users enable row level security;
alter table alerts enable row level security;
alter table link_codes enable row level security;
alter table usage enable row level security;
alter table payments enable row level security;
