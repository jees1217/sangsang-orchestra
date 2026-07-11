-- ============================================================
-- schedules.target_cohort: 단일 기수 → 복수 기수 선택 지원
-- ============================================================

DROP POLICY IF EXISTS "Students can view their schedules" ON public.schedules;

ALTER TABLE public.schedules
  ALTER COLUMN target_cohort TYPE integer[]
  USING (CASE WHEN target_cohort IS NULL THEN NULL ELSE ARRAY[target_cohort] END);

CREATE POLICY "Students can view their schedules"
  ON public.schedules FOR SELECT
  USING (
    get_my_role() = 'student' AND (
      target_type = 'all'
      OR (target_type = 'cohort' AND (
            SELECT cohort FROM public.users WHERE id = auth.uid()
          ) = ANY(target_cohort))
      OR (target_type = 'class' AND target_class_id = (
            SELECT class_id FROM public.users WHERE id = auth.uid()
          ))
      OR (target_type = 'individual' AND target_user_id = auth.uid())
    )
  );
