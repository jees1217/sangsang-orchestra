-- ============================================================
-- 선생님: 담당 학생의 출결 기록은 작성자와 무관하게 열람 가능하게
-- ============================================================
--
-- 00027에서 evaluations에 고친 것과 동일한 문제가 attendances에도 있었다.
-- 기존 "Teachers can manage their students' attendances"(FOR ALL)는
--   teacher_id = auth.uid()
-- 로만 스코프돼 있어, 관리자가 대신 입력한 출결(teacher_id = 관리자)이 담당
-- 선생님 화면에서 전혀 조회되지 않았다 (출결 현황·기수별 집계·수업별 기록 화면
-- 모두 RLS에 걸려 조용히 빠짐 — "수업별 출결·평가" 화면은 이미 기록된 출결을
-- "미기록"으로 잘못 표시해 중복 기록 위험이 있었음).
--
-- 쓰기 권한은 그대로 teacher_id 본인 것으로 유지하고, SELECT만 "내가 담당하는
-- 학생"까지 넓히는 정책을 별도로 추가한다. permissive 정책은 커맨드별로 OR
-- 되므로 SELECT만 넓어지고 UPDATE/DELETE는 본인이 기록한 출결로 계속 제한된다.
--
-- is_teacher_of_student()는 00027에서 이미 만들어둔 SECURITY DEFINER 함수를 그대로 재사용한다.

CREATE POLICY "Teachers can view their students' attendances"
  ON public.attendances FOR SELECT
  USING (
    get_my_role() = 'teacher' AND public.is_teacher_of_student(student_id)
  );
