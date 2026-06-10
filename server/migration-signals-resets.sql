-- ============================================================
-- MIGRACIÓN: Historial de señales + Recuperación de contraseña
-- Pega esto en Supabase → SQL Editor → Run
-- (Tu base existente NO se toca; solo agrega 2 tablas nuevas)
-- ============================================================

create table if not exists signals (
    id bigint generated always as identity primary key,
    coin_id text not null,
    coin_symbol text,
    signal text not null,
    emoji text,
    score int,
    reliability int,
    price_at_signal numeric not null,
    verdict text,
    created_at timestamptz not null default now()
);

create index if not exists idx_signals_created on signals (created_at desc);

create table if not exists password_resets (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

alter table signals enable row level security;
alter table password_resets enable row level security;

-- ===== WATCHLIST PERSONALIZADA (monedas del dashboard por usuario) =====
alter table users add column if not exists watchlist jsonb;
