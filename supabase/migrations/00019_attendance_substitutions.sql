-- 출석 대체 신청 (병가/대회 등 피치 못할 결석에 대한 인정 신청)
-- 학생이 결석 예정 수업과 사유를 신청하고, 증빙서류(이미지/PDF)를 첨부(추후 제출 가능).
-- 관리자(admin)만 승인/반려. 승인돼도 출결은 '결석'을 유지하고, 화면에서 '인정' 태그로만 표시.

CREATE TABLE public.attendance_substitutions (
  id                    uuid default gen_random_uuid() primary key,
  student_id            uuid references public.users(id)     on delete cascade   not null,
  schedule_id           uuid references public.schedules(id) on delete cascade   not null,
  reason                text not null check (reason in ('medical', 'competition')),
  reason_detail         text,
  document_path         text,          -- private 버킷 경로. NULL = 증빙 추후 제출
  document_name         text,
  document_submitted_at timestamptz,
  status                text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by           uuid references public.users(id) on delete set null,
  reviewed_at           timestamptz,
  review_note           text,
  term_key              text not null, -- 기수 단위 정리용 (예: '2026-2027' = 2026.6 ~ 2027.5)
  created_at            timestamptz default timezone('utc', now()) not null,
  unique (student_id, schedule_id)
);

ALTER TABLE public.attendance_substitutions ENABLE ROW LEVEL SECURITY;

-- ── RLS ──
-- 학생: 본인 신청 작성/조회/수정 (심사 필드 변경은 아래 트리거가 차단)
CREATE POLICY "Students manage own substitutions" ON public.attendance_substitutions
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- 관리자: 전체 관리 (승인/반려)
CREATE POLICY "Admin manage all substitutions" ON public.attendance_substitutions
  FOR ALL USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- 디렉터/선생님: 조회만
CREATE POLICY "Director and Teacher view substitutions" ON public.attendance_substitutions
  FOR SELECT USING (get_my_role() IN ('director', 'teacher'));

-- ── 심사 필드 보호 트리거 ──
-- 관리자가 아니면 status/reviewed_* 를 직접 바꿀 수 없고, 승인된 건은 수정 불가.
-- pending/rejected 건을 학생이 수정하면 항상 pending 으로 초기화(재제출) 되어 자가 승인 불가.
CREATE OR REPLACE FUNCTION public.guard_substitution_review()
RETURNS trigger AS $$
BEGIN
  IF get_my_role() <> 'admin' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status      := 'pending';
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.review_note := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'approved' THEN
        RAISE EXCEPTION '이미 승인된 신청은 수정할 수 없습니다.';
      END IF;
      NEW.status      := 'pending';
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.review_note := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_guard_substitution_review
  BEFORE INSERT OR UPDATE ON public.attendance_substitutions
  FOR EACH ROW EXECUTE FUNCTION public.guard_substitution_review();

-- ── 증빙서류 private 스토리지 버킷 ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('substitution-docs', 'substitution-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 경로 규칙: `${student_id}/${파일명}` → 첫 폴더가 본인 uid 여야 함
CREATE POLICY "Students upload own substitution docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'substitution-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Students update own substitution docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'substitution-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Students read own substitution docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'substitution-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 관리자/디렉터/선생님: 모든 증빙 열람 (signed URL 발급용)
CREATE POLICY "Staff read all substitution docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'substitution-docs' AND get_my_role() IN ('admin', 'director', 'teacher'));

-- 관리자: 증빙 삭제 (기수 마감 정리용)
CREATE POLICY "Admin delete substitution docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'substitution-docs' AND get_my_role() = 'admin');
