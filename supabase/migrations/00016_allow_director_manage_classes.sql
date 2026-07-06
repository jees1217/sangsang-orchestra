-- classes 테이블의 생성/수정/삭제(FOR ALL) 정책이 admin 역할에만 열려 있어
-- 디렉터가 클래스 관리 화면에서 반을 생성할 수 없던 문제 수정
DROP POLICY IF EXISTS "Admin can modify all classes" ON public.classes;
CREATE POLICY "Admin/Director can modify all classes" ON public.classes
  FOR ALL USING (get_my_role() IN ('admin', 'director'))
  WITH CHECK (get_my_role() IN ('admin', 'director'));
