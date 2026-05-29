-- ============================================================
-- 추가 테이블 스키마 및 RLS 정책
-- (00000_init.sql에 포함되지 않은 테이블들)
-- ============================================================

-- ----------------------------------------------------------
-- schedules (통합 일정)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedules (
  id               uuid default gen_random_uuid() primary key,
  title            text not null,
  schedule_type    text not null check (schedule_type in ('online','offline','special_lecture','camp','performance','rehearsal','ot')),
  schedule_date    date not null,
  start_time       time not null,
  end_time         time not null,
  teacher_id       uuid references public.users(id) on delete set null,
  location         text,
  target_type      text not null check (target_type in ('all','cohort','class','individual')),
  target_cohort    integer,
  target_class_id  uuid references public.classes(id) on delete set null,
  target_user_id   uuid references public.users(id) on delete set null,
  created_by       uuid references public.users(id) on delete cascade not null,
  created_at       timestamp with time zone default timezone('utc', now()) not null
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- 관리자·디렉터: 전체 조회·수정
CREATE POLICY "Admin/Director can manage schedules"
  ON public.schedules FOR ALL
  USING (get_my_role() IN ('admin', 'director'));

-- 선생님: 전체 조회 (자신이 담당하는 일정 참조용)
CREATE POLICY "Teachers can view schedules"
  ON public.schedules FOR SELECT
  USING (get_my_role() = 'teacher');

-- 학생: 본인에게 해당하는 일정만 조회
CREATE POLICY "Students can view their schedules"
  ON public.schedules FOR SELECT
  USING (
    get_my_role() = 'student' AND (
      target_type = 'all'
      OR (target_type = 'cohort' AND target_cohort = (
            SELECT cohort FROM public.users WHERE id = auth.uid()
          ))
      OR (target_type = 'class' AND target_class_id = (
            SELECT class_id FROM public.users WHERE id = auth.uid()
          ))
      OR (target_type = 'individual' AND target_user_id = auth.uid())
    )
  );

-- ----------------------------------------------------------
-- notices (공지사항·과제)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notices (
  id              uuid default gen_random_uuid() primary key,
  type            text not null check (type in ('notice','assignment')),
  title           text not null,
  content         text not null,
  writer_id       uuid references public.users(id) on delete cascade not null,
  target_type     text not null check (target_type in ('all','cohort','class','individual')),
  target_cohort   integer,
  target_class_id uuid references public.classes(id) on delete set null,
  target_user_id  uuid references public.users(id) on delete set null,
  due_date        timestamp with time zone,
  created_at      timestamp with time zone default timezone('utc', now()) not null
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Director can manage notices"
  ON public.notices FOR ALL
  USING (get_my_role() IN ('admin', 'director'));

CREATE POLICY "Teachers can manage their notices"
  ON public.notices FOR ALL
  USING (get_my_role() = 'teacher' AND writer_id = auth.uid());

CREATE POLICY "Students can view relevant notices"
  ON public.notices FOR SELECT
  USING (
    get_my_role() = 'student' AND (
      target_type = 'all'
      OR (target_type = 'cohort' AND target_cohort = (
            SELECT cohort FROM public.users WHERE id = auth.uid()
          ))
      OR (target_type = 'class' AND target_class_id = (
            SELECT class_id FROM public.users WHERE id = auth.uid()
          ))
      OR (target_type = 'individual' AND target_user_id = auth.uid())
    )
  );

-- ----------------------------------------------------------
-- teacher_availabilities (선생님 가용 시간)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_availabilities (
  id           uuid default gen_random_uuid() primary key,
  teacher_id   uuid references public.users(id) on delete cascade not null,
  day_of_week  integer not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  created_at   timestamp with time zone default timezone('utc', now()) not null
);

ALTER TABLE public.teacher_availabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Director can view all availabilities"
  ON public.teacher_availabilities FOR SELECT
  USING (get_my_role() IN ('admin', 'director'));

CREATE POLICY "Teachers can manage own availabilities"
  ON public.teacher_availabilities FOR ALL
  USING (get_my_role() = 'teacher' AND teacher_id = auth.uid());

-- ----------------------------------------------------------
-- scores (악보 보관함)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scores (
  id         uuid default gen_random_uuid() primary key,
  title      text not null,
  composer   text,
  cohort     integer,
  instrument text,
  file_url   text not null,
  file_name  text not null,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Director can manage scores"
  ON public.scores FOR ALL
  USING (get_my_role() IN ('admin', 'director'));

-- 선생님·학생: 기수와 악기 파트가 본인에게 해당하는 악보만 조회
CREATE POLICY "Teachers can view scores"
  ON public.scores FOR SELECT
  USING (get_my_role() = 'teacher');

CREATE POLICY "Students can view their scores"
  ON public.scores FOR SELECT
  USING (
    get_my_role() = 'student' AND (
      cohort IS NULL
      OR cohort = (SELECT cohort FROM public.users WHERE id = auth.uid())
    )
  );

-- ----------------------------------------------------------
-- evaluations 테이블 추가 컬럼 (score, comment, writer_id)
-- 기존 init.sql의 evaluations와 실제 코드가 다름 → 필요시 적용
-- ----------------------------------------------------------
-- ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS score integer check (score between 1 and 5);
-- ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS comment text;
-- ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS writer_id uuid references public.users(id) on delete cascade;

-- ----------------------------------------------------------
-- users 테이블 추가 컬럼 (cohort, instrument, class_id)
-- ----------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cohort integer;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS instrument text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS class_id uuid references public.classes(id) on delete set null;

-- ----------------------------------------------------------
-- classes 테이블 추가 컬럼 (name, cohort, professor_id, instructor_id)
-- ----------------------------------------------------------
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS cohort integer;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS professor_id uuid references public.users(id) on delete set null;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS instructor_id uuid references public.users(id) on delete set null;
