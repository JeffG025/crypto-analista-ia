-- ============================================================
-- MIGRACIÓN: Índices de rendimiento (revisión Postgres best practices)
-- Pega esto en Supabase → SQL Editor → Run (seguro re-ejecutar)
-- ============================================================

-- El webhook de Stripe busca usuarios por stripe_customer_id al cancelar
-- suscripciones; sin índice escanea toda la tabla.
create index if not exists idx_users_stripe_customer on users (stripe_customer_id)
    where stripe_customer_id is not null;

-- FK sin índice: el borrado en cascada de usuarios escanearía password_resets.
create index if not exists idx_password_resets_user on password_resets (user_id);
