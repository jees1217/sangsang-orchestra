-- ============================================================
-- 선생님: 담당 학생의 평가 점수는 작성자와 무관하게 열람 가능하게
-- ============================================================
--
-- 기존 "Teachers can manage their students' evaluations"(FOR ALL)는
--   writer_id = auth.uid()
-- 로만 스코프돼 있어, 관리자가 대신 입력한 점수(writer_id = 관리자)가 담당
-- 선생님 화면에서 전혀 조회되지 않았다 (평가 이력·기수 평균·수업별 기록 화면
-- 모두 RLS에 걸려 조용히 빠짐 — 특히 "수업별 출결/평가" 화면은 이미 기록된
-- 점수를 "미기록"으로 잘못 표시해 중복 기록 위험이 있었음).
--
-- 쓰기 권한은 그대로 writer_id 본인 것으로 유지하고, SELECT만 "내가 담당하는
-- 학생"까지 넓히는 정책을 별도로 추가한다. permissive 정책은 커맨드별로 OR
-- 되므로 SELECT만 넓어지고 UPDATE/DELETE는 본인이 쓴 평가로 계속 제한된다.
--
-- classes.teacher_ids ↔ users를 evaluations 정책 안에서 직접 서브쿼리하면
-- 00014에서 겪었던 것과 같은 RLS 재귀 위험이 있으므로, 그때와 같은 패턴대로
-- SECURITY DEFINER 함수로 우회한다.

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(target_student_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.classes c ON c.id = u.class_id
    WHERE u.id = target_student_id AND auth.uid() = ANY(c.teacher_ids)
  );
$$;

CREATE POLICY "Teachers can view their students' evaluations"
  ON public.evaluations FOR SELECT
  USING (
    get_my_role() = 'teacher' AND public.is_teacher_of_student(student_id)
  );
