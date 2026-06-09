-- teacher_id (단일) → teacher_ids (uuid 배열) 변경
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_ids uuid[] DEFAULT '{}';

-- 기존 teacher_id 값을 배열로 이전
UPDATE public.classes SET teacher_ids = ARRAY[teacher_id] WHERE teacher_id IS NOT NULL;

ALTER TABLE public.classes DROP COLUMN IF EXISTS teacher_id;
