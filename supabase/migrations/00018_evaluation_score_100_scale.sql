-- 평가 점수를 5점 만점에서 100점 만점으로 변경
ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_score_check;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_score_check CHECK (score BETWEEN 0 AND 100);
