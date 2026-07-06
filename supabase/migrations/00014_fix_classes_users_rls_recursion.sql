-- 00012에서 추가한 classes<->users 상호 참조 정책이 무한 재귀(42P17)를 유발하여
-- 반 생성 자체가 500 에러로 실패하는 문제 수정.
-- get_my_role()과 동일한 패턴(SECURITY DEFINER 함수로 RLS 재평가 없이 조회)으로 재귀를 차단.

CREATE OR REPLACE FUNCTION public.get_my_class_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT class_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(target_class_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = target_class_id AND auth.uid() = ANY(teacher_ids)
  );
$$;

DROP POLICY IF EXISTS "Students can view their classes" ON public.classes;
CREATE POLICY "Students can view their classes" ON public.classes
  FOR SELECT USING (
    is_integrated = true
    OR id = public.get_my_class_id()
  );

DROP POLICY IF EXISTS "Teachers can view assigned students" ON public.users;
CREATE POLICY "Teachers can view assigned students" ON public.users
  FOR SELECT USING (
    get_my_role() = 'teacher' AND public.is_teacher_of_class(class_id)
  );
