-- 출석부 저장(upsert) 시 학생당 하루 1건만 존재하도록 유니크 제약 추가
ALTER TABLE public.attendances
  ADD CONSTRAINT attendances_student_date_unique UNIQUE (student_id, date);
