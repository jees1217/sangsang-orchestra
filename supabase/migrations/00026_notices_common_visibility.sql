-- ============================================================
-- 선생님: 공통 공지(전체·기수)와 담당 반 공지도 열람 가능하게
-- ============================================================
--
-- 기존 "Teachers can manage their notices"(FOR ALL)는 열람 범위가
--   writer_id = 나  OR  target_type = 'teachers'  OR  개별 수신
-- 뿐이라, 관리자가 보낸 전체 공지(target_type='all')·기수 공지, 심지어
-- 내 담당 반으로 보낸 공지조차 선생님 화면에 뜨지 않았다.
--
-- 열람 범위만 넓히고 쓰기 권한은 그대로 둬야 하므로, 기존 FOR ALL 정책은
-- "내가 쓴 글"로 좁혀 유지하고 넓은 범위는 SELECT 전용 정책으로 분리한다.
-- (permissive 정책은 커맨드별로 OR 되므로, SELECT만 넓어지고
--  UPDATE/DELETE는 여전히 본인 글로 제한된다.)

DROP POLICY IF EXISTS "Teachers can manage their notices" ON public.notices;

-- 쓰기(INSERT/UPDATE/DELETE) + 본인 글 열람: 본인이 작성한 글만
CREATE POLICY "Teachers can manage their notices"
  ON public.notices FOR ALL
  USING (get_my_role() = 'teacher' AND writer_id = auth.uid())
  WITH CHECK (get_my_role() = 'teacher' AND writer_id = auth.uid());

-- 열람 전용: 공통 공지 + 선생님 대상 + 담당 반 공지
CREATE POLICY "Teachers can view relevant notices"
  ON public.notices FOR SELECT
  USING (
    get_my_role() = 'teacher' AND (
      target_type IN ('all', 'cohort', 'teachers')
      OR (target_type = 'individual_teacher' AND target_user_id = auth.uid())
      OR (target_type = 'class' AND target_class_id IN (
            SELECT id FROM public.classes WHERE auth.uid() = ANY(teacher_ids)
          ))
    )
  );
