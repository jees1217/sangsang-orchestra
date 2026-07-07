-- 학생 개인의 cohort(가입 기수)와 "교육 기수차"(프로그램 회차)는 서로 다른 개념으로 판명됨.
-- 예: 4기차 교육은 신입 단원을 모집하지 않아 cohort=4인 학생이 존재하지 않음.
-- 따라서 출결 집계 기준을 학생 cohort에서 파생하지 않고, 관리자가 직접 관리하는
-- "교육 기수차"(전체 학생 공통)로 변경한다. 이전에 만든 cohort_periods는 잘못된 전제였으므로 제거.
DROP TABLE IF EXISTS public.cohort_periods;

CREATE TABLE public.attendance_terms (
  term       integer primary key,
  started_at timestamptz,
  closed_at  timestamptz,
  closed_by  uuid references public.users(id) on delete set null
);

ALTER TABLE public.attendance_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view attendance terms" ON public.attendance_terms
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin can manage attendance terms" ON public.attendance_terms
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
