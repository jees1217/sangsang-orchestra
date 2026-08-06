-- 문의게시판 (inquiries)
--
-- 접근  : 로그인한 모든 계정(admin/director/teacher/student)이 목록을 볼 수 있다.
-- 쓰기  : 옵저버(director)를 제외한 모든 계정. (AGENTS.md — role `director` = 옵저버, 읽기 전용)
-- 수정  : 본인이 작성한 글만. 관리자도 남의 글 제목·내용은 수정할 수 없다.
-- 삭제  : 본인 글 + 관리자는 모든 글.
-- 비밀글: 본인 글 + 관리자는 모든 글에 지정/해제 가능.
--
-- 비밀글은 작성자와 관리자만 내용을 볼 수 있다. 나머지 계정에게는 목록에 제목·작성자까지만
-- 잠금 상태로 보이고 본문은 서버에서 제거된다(아래 inquiries_board 뷰).

CREATE TABLE public.inquiries (
  id         uuid default gen_random_uuid() primary key,
  writer_id  uuid references public.users(id) on delete cascade not null,
  title      text not null,
  content    text not null,
  is_secret  boolean not null default false,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz
);

CREATE INDEX inquiries_created_at_idx ON public.inquiries (created_at DESC);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- ── RLS ──
-- 조회: 공개글은 모두, 비밀글은 작성자와 관리자만. (목록 표시는 아래 뷰가 담당하고,
--       테이블을 직접 조회하면 비밀글 본문이 새지 않도록 여기서 원천 차단한다)
CREATE POLICY "Read open inquiries" ON public.inquiries
  FOR SELECT TO authenticated
  USING (NOT is_secret OR writer_id = auth.uid() OR get_my_role() = 'admin');

-- 작성: 옵저버 제외, 본인 명의로만
CREATE POLICY "Write own inquiry" ON public.inquiries
  FOR INSERT TO authenticated
  WITH CHECK (writer_id = auth.uid() AND get_my_role() <> 'director');

-- 수정: 본인 글만 (관리자 포함 — 남의 글 수정 불가)
CREATE POLICY "Update own inquiry" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (writer_id = auth.uid() AND get_my_role() <> 'director')
  WITH CHECK (writer_id = auth.uid());

-- 관리자: 남의 글도 UPDATE 가능하지만, 아래 트리거가 비밀글 지정 외의 변경을 막는다
CREATE POLICY "Admin set secrecy on any inquiry" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- 삭제: 본인 글 (옵저버 제외)
CREATE POLICY "Delete own inquiry" ON public.inquiries
  FOR DELETE TO authenticated
  USING (writer_id = auth.uid() AND get_my_role() <> 'director');

-- 삭제: 관리자는 전체
CREATE POLICY "Admin delete any inquiry" ON public.inquiries
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- ── 수정 범위 보호 트리거 ──
-- RLS는 행 단위라 "관리자는 남의 글의 is_secret 만 바꿀 수 있다"를 표현할 수 없다.
-- 컬럼 단위 제약은 여기서 건다.
CREATE OR REPLACE FUNCTION public.guard_inquiry_update()
RETURNS trigger AS $$
BEGIN
  -- 작성자·작성시각은 어떤 경우에도 바뀌지 않는다
  NEW.writer_id  := OLD.writer_id;
  NEW.created_at := OLD.created_at;

  -- 남의 글(= 위 "Admin set secrecy" 정책으로 들어온 관리자)은 비밀글 지정/해제만 허용
  IF OLD.writer_id <> auth.uid()
     AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content) THEN
    RAISE EXCEPTION '다른 사람이 작성한 글의 제목·내용은 수정할 수 없습니다.';
  END IF;

  -- 비밀글 토글만 한 경우에는 '수정됨' 표시가 붙지 않도록 한다
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.updated_at := timezone('utc', now());
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_inquiry_update
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.guard_inquiry_update();

-- ── 목록용 뷰 ──
-- 비밀글도 "잠긴 글이 있다"는 사실과 제목·작성자까지는 모두에게 보여주되, 본문은 지운다.
-- 테이블 RLS로는 행 자체가 사라져 목록에서 통째로 빠지므로, RLS를 우회하는(security_invoker=false)
-- 뷰에서 본문만 마스킹한다. 읽기 전용이며 쓰기는 항상 테이블로 나간다.
CREATE VIEW public.inquiries_board WITH (security_invoker = false) AS
SELECT
  i.id,
  i.writer_id,
  i.title,
  i.is_secret,
  i.created_at,
  i.updated_at,
  (NOT i.is_secret OR i.writer_id = auth.uid() OR public.get_my_role() = 'admin') AS can_read_content,
  CASE
    WHEN NOT i.is_secret OR i.writer_id = auth.uid() OR public.get_my_role() = 'admin'
    THEN i.content
  END AS content
FROM public.inquiries i;

REVOKE ALL ON public.inquiries       FROM anon;
REVOKE ALL ON public.inquiries_board FROM anon;
GRANT SELECT ON public.inquiries_board TO authenticated;

-- PostgREST 스키마 캐시 갱신 (새 테이블/뷰가 바로 인식되지 않을 때 대비)
NOTIFY pgrst, 'reload schema';
