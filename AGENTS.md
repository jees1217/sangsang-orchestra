<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Role naming: `director` = 옵저버 (Observer)

The `user_role` enum value `director` is a **read-only observer** tier. It is displayed everywhere in the UI as **"옵저버" (Observer)** — the DB enum key and all code references keep the string `director` for backward compatibility (no migration/account changes).

- When working on "옵저버 / observer" features, the role key is `director` (grep `director`, not `observer`).
- `director` has **view-only** access: it can see 단원명부·전체 모니터링·출결/평가·출석 대체·공지·악보·통합 일정, but all edit UI is hidden. Editing is admin-only.
- Note: RLS policies and `/api/users` (`requireAdminOrDirector`) still functionally permit `director` writes — UI is gated but the server side is not yet locked down.
- There is no separate "디렉터/Director" concept anymore; `director` always means observer.
