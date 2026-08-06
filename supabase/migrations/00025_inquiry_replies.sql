-- 문의게시판 답변 (inquiry_replies)
--
-- 답변 작성은 관리자(admin) 전용. 한 문의에 여러 개의 답변을 달 수 있다.
-- 수정은 본인이 쓴 답변만 (문의글과 동일한 원칙), 삭제는 관리자면 모두 가능.
-- 비밀글의 답변은 원글을 볼 수 있는 사람(= 작성자·관리자)에게만 보인다.

CREATE TABLE public.inquiry_replies (
  id         uuid default gen_random_uuid() primary key,
  inquiry_id uuid references public.inquiries(id) on delete cascade not null,
  writer_id  uuid references public.users(id)     on delete cascade not null,
  content    text not null,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz
);

CREATE INDEX inquiry_replies_inquiry_idx ON public.inquiry_replies (inquiry_id, created_at);

ALTER TABLE public.inquiry_replies ENABLE ROW LEVEL SECURITY;

-- ── RLS ──
-- 조회: 원글을 읽을 수 있으면 답변도 읽을 수 있다.
--       (비밀글이면 inquiries 의 SELECT 정책이 원글을 감추므로 답변도 함께 감춰진다)
CREATE POLICY "Read replies of visible inquiries" ON public.inquiry_replies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inquiries i
    WHERE i.id = inquiry_replies.inquiry_id
      AND (NOT i.is_secret OR i.writer_id = auth.uid() OR get_my_role() = 'admin')
  ));

-- 작성: 관리자만, 본인 명의로
CREATE POLICY "Admin write reply" ON public.inquiry_replies
  FOR INSERT TO authenticated
  WITH CHECK (writer_id = auth.uid() AND get_my_role() = 'admin');

-- 수정: 본인이 쓴 답변만
CREATE POLICY "Admin update own reply" ON public.inquiry_replies
  FOR UPDATE TO authenticated
  USING (writer_id = auth.uid() AND get_my_role() = 'admin')
  WITH CHECK (writer_id = auth.uid() AND get_my_role() = 'admin');

-- 삭제: 관리자는 모든 답변
CREATE POLICY "Admin delete any reply" ON public.inquiry_replies
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- ── 수정 범위 보호 트리거 ──
CREATE OR REPLACE FUNCTION public.guard_inquiry_reply_update()
RETURNS trigger AS $$
BEGIN
  -- 소속 문의·작성자·작성시각은 바뀌지 않는다
  NEW.inquiry_id := OLD.inquiry_id;
  NEW.writer_id  := OLD.writer_id;
  NEW.created_at := OLD.created_at;

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.updated_at := timezone('utc', now());
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_inquiry_reply_update
  BEFORE UPDATE ON public.inquiry_replies
  FOR EACH ROW EXECUTE FUNCTION public.guard_inquiry_reply_update();

REVOKE ALL ON public.inquiry_replies FROM anon;

-- PostgREST 스키마 캐시 갱신 (새 테이블/뷰가 바로 인식되지 않을 때 대비)
NOTIFY pgrst, 'reload schema';
