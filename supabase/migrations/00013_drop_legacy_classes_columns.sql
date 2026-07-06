-- 00012에서 RLS 정책을 새 모델로 교체했으므로, 이제 아무데도 의존하지 않는 구 컬럼 삭제
-- (teacher_id NOT NULL 제약 때문에 teacher_ids만 지정하는 새 반 생성이 항상 400으로 실패하던 문제의 근본 원인)
ALTER TABLE public.classes DROP COLUMN IF EXISTS teacher_id;
ALTER TABLE public.classes DROP COLUMN IF EXISTS student_id;
