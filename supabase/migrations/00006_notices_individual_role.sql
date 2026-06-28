-- notices.target_type 체크 제약 확장: 개별 선생님/관리자 추가
ALTER TABLE public.notices DROP CONSTRAINT IF EXISTS notices_target_type_check;
ALTER TABLE public.notices ADD CONSTRAINT notices_target_type_check
  CHECK (target_type IN (
    'all', 'cohort', 'class', 'individual',
    'teachers', 'admins',
    'individual_teacher', 'individual_admin'
  ));

-- 선생님이 개별 수신된 notices(individual_teacher)도 볼 수 있도록 정책 갱신
DROP POLICY IF EXISTS "Teachers can manage their notices" ON public.notices;

CREATE POLICY "Teachers can manage their notices"
  ON public.notices FOR ALL
  USING (
    get_my_role() = 'teacher'
    AND (
      writer_id = auth.uid()
      OR target_type = 'teachers'
      OR (target_type = 'individual_teacher' AND target_user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_my_role() = 'teacher'
    AND writer_id = auth.uid()
  );
