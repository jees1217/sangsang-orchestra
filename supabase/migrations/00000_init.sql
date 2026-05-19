-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'director', 'teacher', 'student');
CREATE TYPE target_audience AS ENUM ('ALL_STUDENTS', 'ALL_TEACHERS', 'MY_STUDENTS');
CREATE TYPE attendance_status AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- Users table
CREATE TABLE public.users (
  id uuid references auth.users on delete cascade not null primary key,
  email text unique not null,
  name text not null,
  role user_role not null default 'student',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Classes table
CREATE TABLE public.classes (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references public.users(id) on delete cascade not null,
  student_id uuid references public.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  UNIQUE(teacher_id, student_id)
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Assignments table
CREATE TABLE public.assignments (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null,
  file_url text,
  author_id uuid references public.users(id) on delete cascade not null,
  target_audience target_audience not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Attendances table
CREATE TABLE public.attendances (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  teacher_id uuid references public.users(id) on delete cascade not null,
  date date not null,
  status attendance_status not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- Evaluations table
CREATE TABLE public.evaluations (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  teacher_id uuid references public.users(id) on delete cascade not null,
  date date not null,
  progress text not null,
  attitude_score integer not null check (attitude_score >= 1 and attitude_score <= 10),
  comments text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Helper Function to get current user role securely without recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid();
$$;

-- RLS Policies for users
CREATE POLICY "Admin/Director can view all users" ON public.users FOR SELECT USING (get_my_role() IN ('admin', 'director'));
CREATE POLICY "Users can view themselves" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "Teachers can view assigned students" ON public.users FOR SELECT USING (
  get_my_role() = 'teacher' AND EXISTS (SELECT 1 FROM public.classes WHERE teacher_id = auth.uid() AND student_id = users.id)
);
CREATE POLICY "Admin can modify all users" ON public.users FOR ALL USING (get_my_role() = 'admin');

-- RLS Policies for classes
CREATE POLICY "Students can view their classes" ON public.classes FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Teachers can view their classes" ON public.classes FOR SELECT USING (teacher_id = auth.uid());
CREATE POLICY "Admin/Director can view all classes" ON public.classes FOR SELECT USING (get_my_role() IN ('admin', 'director'));
CREATE POLICY "Admin can modify all classes" ON public.classes FOR ALL USING (get_my_role() = 'admin');

-- RLS Policies for assignments
CREATE POLICY "Admin/Director can view all assignments" ON public.assignments FOR SELECT USING (get_my_role() IN ('admin', 'director'));
CREATE POLICY "Admin/Director can create/update assignments" ON public.assignments FOR ALL USING (get_my_role() IN ('admin', 'director'));
CREATE POLICY "Teachers can view relevant assignments" ON public.assignments FOR SELECT USING (
  get_my_role() = 'teacher' AND (author_id = auth.uid() OR target_audience IN ('ALL_TEACHERS', 'ALL_STUDENTS'))
);
CREATE POLICY "Teachers can create assignments for their students" ON public.assignments FOR INSERT WITH CHECK (
  get_my_role() = 'teacher' AND author_id = auth.uid() AND target_audience = 'MY_STUDENTS'
);
CREATE POLICY "Students can view relevant assignments" ON public.assignments FOR SELECT USING (
  get_my_role() = 'student' AND (
    target_audience = 'ALL_STUDENTS' OR
    (target_audience = 'MY_STUDENTS' AND EXISTS (SELECT 1 FROM public.classes WHERE student_id = auth.uid() AND teacher_id = assignments.author_id))
  )
);

-- RLS Policies for attendances
CREATE POLICY "Students can view own attendances" ON public.attendances FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Teachers can manage their students' attendances" ON public.attendances FOR ALL USING (teacher_id = auth.uid() AND get_my_role() = 'teacher');
CREATE POLICY "Admin/Director can view all attendances" ON public.attendances FOR SELECT USING (get_my_role() IN ('admin', 'director'));
CREATE POLICY "Admin can manage all attendances" ON public.attendances FOR ALL USING (get_my_role() = 'admin');

-- RLS Policies for evaluations
CREATE POLICY "Students can view own evaluations" ON public.evaluations FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Teachers can manage their students' evaluations" ON public.evaluations FOR ALL USING (teacher_id = auth.uid() AND get_my_role() = 'teacher');
CREATE POLICY "Admin/Director can view all evaluations" ON public.evaluations FOR SELECT USING (get_my_role() IN ('admin', 'director'));
CREATE POLICY "Admin can manage all evaluations" ON public.evaluations FOR ALL USING (get_my_role() = 'admin');

-- Trigger to automatically insert a user profile when auth.users is created (optional but recommended for complete DB setup)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', 'Unknown User'), 'student');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
