-- ============================================================
-- users 테이블 — 민감 개인정보 컬럼 추가 (admin·director 전용)
-- ============================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS guardian  text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone     text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address   text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS note      text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active      boolean not null default true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_date     date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS grade          text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS guardian_phone text;
