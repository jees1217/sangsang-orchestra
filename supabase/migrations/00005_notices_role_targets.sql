-- notices.target_type 체크 제약 확장: 선생님그룹(teachers) / 관리자그룹(admins) 추가
ALTER TABLE public.notices DROP CONSTRAINT IF EXISTS notices_target_type_check;
ALTER TABLE public.notices ADD CONSTRAINT notices_target_type_check
  CHECK (target_type IN ('all', 'cohort', 'class', 'individual', 'teachers', 'admins'));

-- 선생님이 자신에게 수신된 notices(target_type='teachers')도 볼 수 있도록 정책 갱신
DROP POLICY IF EXISTS "Teachers can manage their notices" ON public.notices;

CREATE POLICY "Teachers can manage their notices"
  ON public.notices FOR ALL
  USING (
    get_my_role() = 'teacher'
    AND (writer_id = auth.uid() OR target_type = 'teachers')
  )
  WITH CHECK (
    get_my_role() = 'teacher'
    AND writer_id = auth.uid()
  );
