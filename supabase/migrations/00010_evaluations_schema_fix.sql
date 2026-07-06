-- evaluations 테이블이 실제 앱 코드(score/comment/writer_id)와 어긋나 있어 평가 등록이 항상 실패하던 문제 수정
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS score integer check (score between 1 and 5);
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS comment text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS writer_id uuid references public.users(id) on delete cascade;

-- 앱 코드가 채우지 않는 구(舊) 컬럼들을 NOT NULL에서 해제
ALTER TABLE public.evaluations ALTER COLUMN teacher_id DROP NOT NULL;
ALTER TABLE public.evaluations ALTER COLUMN date DROP NOT NULL;
ALTER TABLE public.evaluations ALTER COLUMN progress DROP NOT NULL;
ALTER TABLE public.evaluations ALTER COLUMN attitude_score DROP NOT NULL;
ALTER TABLE public.evaluations ALTER COLUMN comments DROP NOT NULL;

-- teacher_id 대신 writer_id 기준으로 본인 작성 평가를 관리하도록 정책 교체
DROP POLICY IF EXISTS "Teachers can manage their students' evaluations" ON public.evaluations;
CREATE POLICY "Teachers can manage their students' evaluations" ON public.evaluations
  FOR ALL USING (writer_id = auth.uid() AND get_my_role() = 'teacher')
  WITH CHECK (writer_id = auth.uid() AND get_my_role() = 'teacher');

DROP POLICY IF EXISTS "Admin can manage all evaluations" ON public.evaluations;
CREATE POLICY "Admin can manage all evaluations" ON public.evaluations
  FOR ALL USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
