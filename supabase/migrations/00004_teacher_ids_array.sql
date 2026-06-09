-- teacher_id(단일)는 migration 00003에서 이미 제거됨
-- teacher_ids uuid[] 배열 컬럼 추가
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_ids uuid[] DEFAULT '{}';
