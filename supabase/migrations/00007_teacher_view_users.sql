-- 선생님이 공지 작성자 이름 등을 표시하기 위해 전체 유저 조회 허용
CREATE POLICY "Teachers can view all users"
  ON public.users FOR SELECT
  USING (get_my_role() = 'teacher');
