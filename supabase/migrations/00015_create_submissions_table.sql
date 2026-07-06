-- submissions 테이블이 아예 존재하지 않아 학생의 "과제 확인 완료" 체크 기능
-- (student/assignments/page.tsx) 전체가 항상 실패하던 문제 수정
CREATE TABLE public.submissions (
  id uuid default gen_random_uuid() primary key,
  notice_id uuid references public.notices(id) on delete cascade not null,
  student_id uuid references public.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (notice_id, student_id)
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can manage own submissions" ON public.submissions
  FOR ALL USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admin/Director/Teacher can view all submissions" ON public.submissions
  FOR SELECT USING (get_my_role() IN ('admin', 'director', 'teacher'));
