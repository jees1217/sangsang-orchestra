-- professor_id / instructor_id → teacher_id 통합
-- 우선순위: 기존 teacher_id > professor_id > instructor_id
UPDATE public.classes
SET teacher_id = COALESCE(teacher_id, professor_id, instructor_id)
WHERE teacher_id IS NULL
  AND (professor_id IS NOT NULL OR instructor_id IS NOT NULL);

ALTER TABLE public.classes DROP COLUMN IF EXISTS professor_id;
ALTER TABLE public.classes DROP COLUMN IF EXISTS instructor_id;
