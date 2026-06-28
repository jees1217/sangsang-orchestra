-- 학생이 공지 작성자 이름 표시를 위해 전체 유저 조회 허용
CREATE POLICY "Students can view all users"
  ON public.users FOR SELECT
  USING (get_my_role() = 'student');
