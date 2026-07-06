-- classes.teacher_id/student_id(단수)는 옛 1교사-1학생 모델의 잔재로, 앱 코드는 전부
-- teacher_ids(배열) + users.class_id 모델로 전환되었지만 RLS 정책 3개가 여전히 구 컬럼에
-- 의존하고 있어 새로 배정된 반/학생이 실제로는 보이지 않는 문제를 수정

-- 0) classes.meeting_link / is_integrated 컬럼이 아예 없어 "수업 링크 관리" 기능 전체가
--    항상 실패하던 문제도 함께 수정
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS meeting_link text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_integrated boolean NOT NULL DEFAULT false;

-- 1) classes: 교사가 자신의 반을 볼 수 있도록 (teacher_ids 배열 기준)
DROP POLICY IF EXISTS "Teachers can view their classes" ON public.classes;
CREATE POLICY "Teachers can view their classes" ON public.classes
  FOR SELECT USING (auth.uid() = ANY(teacher_ids));

-- 2) classes: 학생이 자신의 반(또는 통합 합주)을 볼 수 있도록
DROP POLICY IF EXISTS "Students can view their classes" ON public.classes;
CREATE POLICY "Students can view their classes" ON public.classes
  FOR SELECT USING (
    is_integrated = true
    OR id = (SELECT class_id FROM public.users WHERE id = auth.uid())
  );

-- 3) users: 교사가 자기 반 학생을 볼 수 있도록
DROP POLICY IF EXISTS "Teachers can view assigned students" ON public.users;
CREATE POLICY "Teachers can view assigned students" ON public.users
  FOR SELECT USING (
    get_my_role() = 'teacher' AND EXISTS (
      SELECT 1 FROM public.classes
      WHERE classes.id = users.class_id AND auth.uid() = ANY(classes.teacher_ids)
    )
  );

-- 4) assignments(미사용 레거시 테이블, 앱 코드에서 참조 없음) 정책도 동일 패턴으로 교체
DROP POLICY IF EXISTS "Students can view relevant assignments" ON public.assignments;
CREATE POLICY "Students can view relevant assignments" ON public.assignments
  FOR SELECT USING (
    get_my_role() = 'student' AND (
      target_audience = 'ALL_STUDENTS' OR (
        target_audience = 'MY_STUDENTS' AND EXISTS (
          SELECT 1 FROM public.classes c JOIN public.users u ON u.class_id = c.id
          WHERE u.id = auth.uid() AND assignments.author_id = ANY(c.teacher_ids)
        )
      )
    )
  );
