-- 출석부가 날짜만 기준이라 같은 날 여러 수업(schedule)이 있으면 학생이 뒤섞이고,
-- 학생당 하루 1건 제약 때문에 같은 날 두 번째 수업 출석이 첫 수업 기록을 덮어쓰던 문제 수정.
-- attendances/evaluations에 schedule_id를 추가해 "이 수업 회차에 대한 기록"으로 범위를 좁힘.

ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS schedule_id uuid references public.schedules(id) on delete set null;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS schedule_id uuid references public.schedules(id) on delete set null;

ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_student_date_unique;
ALTER TABLE public.attendances ADD CONSTRAINT attendances_student_schedule_unique UNIQUE (student_id, schedule_id);
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_student_schedule_unique UNIQUE (student_id, schedule_id);

-- 디렉터는 그동안 attendances/evaluations를 조회만 가능하고 기록은 불가능했음 (admin 전용).
-- 선생님/디렉터/관리자 모두 수업별 출결·평가를 기록할 수 있어야 하므로 director 추가.
DROP POLICY IF EXISTS "Admin can manage all attendances" ON public.attendances;
CREATE POLICY "Admin/Director can manage all attendances" ON public.attendances
  FOR ALL USING (get_my_role() IN ('admin', 'director'))
  WITH CHECK (get_my_role() IN ('admin', 'director'));

DROP POLICY IF EXISTS "Admin can manage all evaluations" ON public.evaluations;
CREATE POLICY "Admin/Director can manage all evaluations" ON public.evaluations
  FOR ALL USING (get_my_role() IN ('admin', 'director'))
  WITH CHECK (get_my_role() IN ('admin', 'director'));
