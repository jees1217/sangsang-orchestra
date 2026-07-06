-- 로그인 없이도 누구나 읽기/쓰기/삭제가 가능했던 익명 전체 허용 정책 제거 (보안 취약점)
DROP POLICY IF EXISTS "Allow anonymous full access to classes" ON public.classes;
DROP POLICY IF EXISTS "Allow anonymous full access to evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "Allow anonymous full access to notices" ON public.notices;
DROP POLICY IF EXISTS "Allow anonymous full access to scores" ON public.scores;
DROP POLICY IF EXISTS "Allow anonymous full access to teacher_availabilities" ON public.teacher_availabilities;
DROP POLICY IF EXISTS "Allow anonymous full access to schedules" ON public.schedules;
