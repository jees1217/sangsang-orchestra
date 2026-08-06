<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Role naming: `director` = 옵저버 (Observer)

The `user_role` enum value `director` is a **read-only observer** tier. It is displayed everywhere in the UI as **"옵저버" (Observer)** — the DB enum key and all code references keep the string `director` for backward compatibility (no migration/account changes).

- When working on "옵저버 / observer" features, the role key is `director` (grep `director`, not `observer`).
- `director` has **view-only** access: it can see 단원명부·전체 모니터링·출결/평가·출석 대체·공지·악보·통합 일정, but all edit UI is hidden. Editing is admin-only.
- The server side is locked down too, as of migration `00023_lock_director_readonly.sql`: `director` has SELECT-only RLS on classes/attendances/evaluations/schedules/notices/scores/assignments, and `/api/users` + `/api/users/private` are admin-only (`requireAdmin`).
- There is no separate "디렉터/Director" concept anymore; `director` always means observer.

# 출결 집계 정책 (지각 환산 · 인정결석)

Raw `attendances` rows are **never mutated** by these rules — the `attendance_status` enum stays `PRESENT`/`LATE`/`ABSENT` exactly as recorded. Both rules are applied **only at aggregation time**, in `src/lib/attendance.ts` (`computeAttendanceStats`). Any new screen that counts attendance must go through that helper rather than counting `status === 'ABSENT'` by hand.

- **집계 구간은 항상 기수(term).** Never use a rolling "최근 N일" window — it is meaningless here. Scope every attendance query with `scopeToTerm(query, await fetchCurrentTerm(supabase))`; the current term is the `attendance_terms` row with `closed_at IS NULL`. If no term is open (or `started_at` is null, which `handleSetTerm` allows), that boundary is simply left open and the count falls back to 전 기간 — label it `전 기간`, not a fake term number.
- Term-scoped totals span a whole 기수, so they can exceed PostgREST's per-response row cap (1000) and would then **undercount silently**. Multi-student aggregate queries must page via `fetchAllPages` with a unique `.order('id')` cursor — `date` is not unique and shuffles rows across page boundaries.

- **지각 3회 = 결석 1회.** `convertedAbsent = floor(late / LATE_TO_ABSENT_RATIO)` is added to the absence total (`effectiveAbsent`). The 지각 count itself is still displayed unchanged.
- **인정결석 (출석 대체 승인).** An `ABSENT` row whose `(student_id, schedule_id)` has an `approved` row in `attendance_substitutions` is counted as `excused` instead of `absent`. Excused absences are removed from the absence count **and from the attendance-rate denominator** — so they neither hurt nor help the rate.
  - ⚠️ The doc comment at the top of `supabase/migrations/00019_attendance_substitutions.sql` predates this and still says approval only adds an "인정" tag without affecting 출결. The migration is already applied, so the comment was left as-is; **this file is the current policy.**
  - Matching requires `attendances.schedule_id`; rows predating `00017` have a null `schedule_id` and can never be excused.
- Call sites must bucket excused rows into `excused` (not `absent`) before calling the helper — see `fetchInitialData`/`loadTermReport` in `src/app/dashboard/evaluations/page.tsx` and `init` in `src/app/dashboard/teacher/students/page.tsx`.
- UI convention: show an "인정" stat/column only when `excused > 0`, and put the full derivation (`absenceBreakdown()`) in the 결석 figure's `title` tooltip.

# 평가 점수 (evaluations.score)

`0` is a valid score, so **never use `||` to default it** — `score || 100` silently rewrites a deliberate 0 into 100. Use `??`. Marking a student 결석 in the 수업별 출결·평가 tab auto-sets their score to 0 (still editable afterward).

# 문의게시판 (inquiries · inquiry_replies)

Permissions differ from every other screen, so don't copy the 공지 pattern. Migrations `00024_inquiries.sql` / `00025_inquiry_replies.sql`.

- 열람은 전원, 쓰기는 옵저버(`director`) 제외 전원. **수정은 항상 본인 글만 — 관리자도 남의 글 제목·내용은 못 고친다.** 삭제·비밀글 지정은 본인 글 + 관리자는 전체.
- "관리자는 남의 글의 `is_secret` 만 바꾼다"는 컬럼 단위 제약이라 RLS로 표현할 수 없다. 관리자에게 UPDATE 자체는 열어두고, `guard_inquiry_update` 트리거가 남의 글이면 title/content 변경 시 예외를 던진다. 새 컬럼을 추가하면 이 트리거에도 반영해야 한다.
- 목록은 **반드시 `inquiries_board` 뷰**에서 읽는다. 테이블 RLS는 비밀글 행 자체를 숨기므로(=목록에서 통째로 사라짐), 뷰가 RLS를 우회(`security_invoker = false`)해 제목·작성자만 남기고 본문을 NULL로 지운 뒤 `can_read_content` 플래그를 함께 내려준다. 쓰기는 항상 테이블로 나간다.
- 답변(`inquiry_replies`)은 관리자만 작성. 답변 SELECT 정책이 원글 가시성을 그대로 따라가므로 비밀글의 답변은 작성자·관리자에게만 내려간다 — 화면에서 따로 거를 필요 없다.
