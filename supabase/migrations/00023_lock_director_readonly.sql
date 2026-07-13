-- director(= UI 표기 '옵저버')를 읽기 전용(참관)으로 강제한다.
-- 그동안 여러 정책이 director 에게 쓰기(FOR ALL)를 허용하고 있었다. 이를 관리자 전용으로 되돌리고
-- director 에게는 조회(SELECT)만 남긴다. UI는 이미 편집 기능을 숨겼고, 이 마이그레이션이 서버(RLS)까지 잠근다.
-- 참고: AGENTS.md - role `director` = 옵저버(Observer)

-- ── classes: 수정은 admin 전용 (director 조회는 init의 "Admin/Director can view all classes"로 유지) ──
DROP POLICY IF EXISTS "Admin/Director can modify all classes" ON public.classes;
CREATE POLICY "Admin can modify all classes" ON public.classes
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- ── assignments(레거시): 생성/수정 admin 전용 (director 조회는 init "Admin/Director can view all assignments"로 유지) ──
DROP POLICY IF EXISTS "Admin/Director can create/update assignments" ON public.assignments;
CREATE POLICY "Admin can manage assignments" ON public.assignments
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- ── attendances: 관리 admin 전용 (director 조회는 init "Admin/Director can view all attendances"로 유지) ──
DROP POLICY IF EXISTS "Admin/Director can manage all attendances" ON public.attendances;
CREATE POLICY "Admin can manage all attendances" ON public.attendances
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- ── evaluations: 관리 admin 전용 (director 조회는 init "Admin/Director can view all evaluations"로 유지) ──
DROP POLICY IF EXISTS "Admin/Director can manage all evaluations" ON public.evaluations;
CREATE POLICY "Admin can manage all evaluations" ON public.evaluations
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- ── schedules: 통합 정책이 조회까지 겸했으므로, 관리 admin 전용 + director 조회 정책을 신설 ──
DROP POLICY IF EXISTS "Admin/Director can manage schedules" ON public.schedules;
CREATE POLICY "Admin can manage schedules" ON public.schedules
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Director can view schedules" ON public.schedules
  FOR SELECT USING (get_my_role() = 'director');

-- ── notices: 관리 admin 전용 + director 조회 정책 신설 ──
DROP POLICY IF EXISTS "Admin/Director can manage notices" ON public.notices;
CREATE POLICY "Admin can manage notices" ON public.notices
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Director can view notices" ON public.notices
  FOR SELECT USING (get_my_role() = 'director');

-- ── scores: 관리 admin 전용 + director 조회 정책 신설 ──
DROP POLICY IF EXISTS "Admin/Director can manage scores" ON public.scores;
CREATE POLICY "Admin can manage scores" ON public.scores
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Director can view scores" ON public.scores
  FOR SELECT USING (get_my_role() = 'director');
