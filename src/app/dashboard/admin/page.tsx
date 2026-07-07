import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CollapsibleList } from '@/components/CollapsibleList'
import styles from './admin.module.css'

const SCHEDULE_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  offline:         { label: '오프라인 합주', icon: '🎻', color: '#2B6CB0', bg: '#EBF8FF' },
  performance:     { label: '연주회',        icon: '🎉', color: '#6B46C1', bg: '#FAF5FF' },
  rehearsal:       { label: '리허설',        icon: '🔄', color: '#475569', bg: '#F1F5F9' },
  online:          { label: '온라인 수업',   icon: '💻', color: '#00897B', bg: '#E6F7F6' },
  special_lecture: { label: '명사 특강',     icon: '🎓', color: '#6B46C1', bg: '#FAF5FF' },
  camp:            { label: '음악 캠프',     icon: '🏕️', color: '#C05621', bg: '#FFFAF0' },
  ot:              { label: '오리엔테이션',  icon: '👋', color: '#475569', bg: '#F1F5F9' },
}

function getDaysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminData } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const role = ((adminData?.role as string) || '').toLowerCase()
  if (role !== 'admin') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#e74c3c', marginBottom: '16px' }}>⚠️ 접근 권한 없음</h1>
        <p style={{ color: '#666' }}>관리자(Admin) 전용 페이지입니다.</p>
        <a href="/dashboard" style={{ color: '#00A99D', marginTop: '16px', display: 'inline-block' }}>
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  const name = adminData?.name || '관리자'
  const todayStr = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const [
    { data: rawStudents },
    { data: rawTeachers },
    { data: rawAttendances },
    { data: rawEvals },
    { data: rawSchedules },
    { data: rawNotices },
    { data: rawAssignments },
  ] = await Promise.all([
    supabase.from('users').select('id').eq('role', 'student'),
    supabase.from('users').select('id').eq('role', 'teacher'),

    supabase
      .from('attendances')
      .select('status, date, student:student_id(name)')
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false }),

    supabase
      .from('evaluations')
      .select('id, score, comment, created_at, writer:writer_id(name), student:student_id(name)')
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('schedules')
      .select('id, title, schedule_type, schedule_date, start_time, location')
      .gte('schedule_date', todayStr)
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(10),

    supabase
      .from('notices')
      .select('id, title, created_at, writer_id')
      .eq('type', 'notice')
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('notices')
      .select('id, title, due_date, writer_id')
      .eq('type', 'assignment')
      .order('due_date', { ascending: true })
      .limit(5),
  ])

  // 공지/과제 작성자 이름 조회
  const writerIds = [...new Set([
    ...(rawNotices || []).map((n: any) => n.writer_id),
    ...(rawAssignments || []).map((a: any) => a.writer_id),
  ].filter(Boolean))]
  const { data: writerRows } = writerIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', writerIds)
    : { data: [] }
  const userMap: Record<string, string> = {}
  ;(writerRows || []).forEach((u: any) => { userMap[u.id] = u.name })

  const studentCount = (rawStudents  || []).length
  const teacherCount = (rawTeachers  || []).length
  const attendances  = rawAttendances || []
  const evaluations  = rawEvals       || []
  const schedules    = rawSchedules   || []

  const present = attendances.filter((a: any) => a.status === 'PRESENT').length
  const late    = attendances.filter((a: any) => a.status === 'LATE').length
  const absent  = attendances.filter((a: any) => a.status === 'ABSENT').length
  const total   = attendances.length

  const recentAbsences = attendances
    .filter((a: any) => a.status === 'ABSENT')
    .slice(0, 10)

  return (
    <div className={styles.container}>

      {/* ── 웰컴 배너 ── */}
      <div className={styles.welcomeBanner}>
        <div>
          <div className={styles.welcomeGreeting}>안녕하세요, {name} 관리자님! ⚙️</div>
          <div className={styles.welcomeMeta}>
            <span>전체 단원 {studentCount}명</span>
            <span className={styles.sep}>·</span>
            <span>선생님 {teacherCount}명</span>
          </div>
        </div>
        <div className={styles.welcomeDate}>{todayDisplay}</div>
      </div>

      {/* ── 상단 3열 그리드 ── */}
      <div className={styles.grid}>

        {/* ── 카드 1: 전체 출결 현황 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📊</span>
            전체 출결 현황
            <span className={styles.badgeSub}>최근 30일</span>
          </h2>

          <div className={styles.statRow}>
            <div className={`${styles.statBox} ${styles.statPresent}`}>
              <span className={styles.statNum}>{present}</span>
              <span className={styles.statLabel}>출석</span>
            </div>
            <div className={`${styles.statBox} ${styles.statLate}`}>
              <span className={styles.statNum}>{late}</span>
              <span className={styles.statLabel}>지각</span>
            </div>
            <div className={`${styles.statBox} ${styles.statAbsent}`}>
              <span className={styles.statNum}>{absent}</span>
              <span className={styles.statLabel}>결석</span>
            </div>
          </div>
          <div className={styles.statTotal}>총 {total}건 기록</div>

          <div className={styles.sectionLabel}>최근 결석자</div>
          {recentAbsences.length === 0 ? (
            <div className={styles.emptySmall}>✅ 최근 결석자가 없습니다.</div>
          ) : (
            <ul className={styles.absenceList}>
              {recentAbsences.map((a: any, i: number) => {
                const dateLabel = new Date(a.date + 'T00:00:00').toLocaleDateString('ko-KR', {
                  month: 'numeric', day: 'numeric', weekday: 'short',
                })
                return (
                  <li key={i} className={styles.absenceItem}>
                    <span className={styles.absenceName}>{(a.student as any)?.name ?? '알 수 없음'}</span>
                    <span className={styles.absenceDate}>{dateLabel}</span>
                  </li>
                )
              })}
            </ul>
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>출결 관리 & CSV 다운로드 →</a>
        </div>

        {/* ── 카드 2: 강의평가 피드 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📝</span>
            강의평가 피드
            <span className={styles.badge}>{evaluations.length}건</span>
          </h2>

          {evaluations.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📭</span>
              <p>등록된 강의평가가 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.evalList}>
              {evaluations.map((ev: any) => {
                const score   = ev.score ?? 0
                const comment = ev.comment ?? ''
                const preview = comment.length > 55 ? comment.substring(0, 55) + '…' : comment
                const dateLabel   = new Date(ev.created_at).toLocaleDateString('ko-KR')
                const writerName  = (ev.writer  as any)?.name ?? '알 수 없음'
                const studentName = (ev.student as any)?.name ?? '알 수 없음'
                return (
                  <li key={ev.id} className={styles.evalItem}>
                    <div className={styles.evalHeader}>
                      <span className={styles.evalTeacher}>{writerName} 선생님</span>
                      <span className={styles.evalArrow}>→</span>
                      <span className={styles.evalStudent}>{studentName}</span>
                      <span className={styles.evalDate}>{dateLabel}</span>
                    </div>
                    <div className={styles.evalScore}>
                      <span className={styles.evalScoreNum}>{score}점</span>
                    </div>
                    {preview && (
                      <div className={styles.evalComment}>"{preview}"</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>전체 평가 내역 & CSV 다운로드 →</a>
        </div>

        {/* ── 카드 3: 전체 일정 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>🗓</span>
            전체 일정
            {schedules.length > 0 && (
              <span className={styles.badge}>{schedules.length}건</span>
            )}
          </h2>

          {schedules.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📅</span>
              <p>예정된 일정이 없습니다.</p>
            </div>
          ) : (
            <CollapsibleList
              visibleCount={3}
              listClassName={styles.scheduleList}
              toggleClassName={styles.moreLink}
              items={schedules.map((sc: any) => {
                const cfg = SCHEDULE_TYPE_CONFIG[sc.schedule_type] ?? {
                  label: sc.schedule_type, icon: '📌', color: '#475569', bg: '#F1F5F9',
                }
                const daysLeft = getDaysFromToday(sc.schedule_date)
                const dateLabel = new Date(sc.schedule_date + 'T00:00:00').toLocaleDateString('ko-KR', {
                  month: 'numeric', day: 'numeric', weekday: 'short',
                })
                return (
                  <li key={sc.id} className={styles.scheduleItem}>
                    <span className={`${styles.daysChip} ${daysLeft === 0 ? styles.daysToday : daysLeft <= 7 ? styles.daysSoon : ''}`}>
                      {daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
                    </span>
                    <div className={styles.scheduleBody}>
                      <div className={styles.scheduleTop}>
                        <span style={{ color: cfg.color }}>{cfg.icon}</span>
                        <span className={styles.scheduleTitle}>{sc.title}</span>
                      </div>
                      <div className={styles.scheduleMeta}>
                        <span>{dateLabel} {sc.start_time.substring(0, 5)}</span>
                        {sc.location && <span>📍 {sc.location}</span>}
                      </div>
                    </div>
                  </li>
                )
              })}
            />
          )}

          <a href="/dashboard/schedules" className={styles.moreLink}>전체 일정 관리 →</a>
        </div>

      </div>

      {/* ── 하단 2열 그리드 ── */}
      <div className={styles.grid2}>

        {/* ── 카드 4: 공지사항 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📢</span>
            공지사항
            {(rawNotices || []).length > 0 && (
              <span className={styles.badge}>{(rawNotices || []).length}건</span>
            )}
          </h2>

          {(rawNotices || []).length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📭</span>
              <p>등록된 공지사항이 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.noticeList}>
              {(rawNotices || []).map((n: any) => (
                <li key={n.id} className={styles.noticeItem}>
                  <div className={styles.noticeTitle}>{n.title}</div>
                  <div className={styles.noticeMeta}>
                    <span>{userMap[n.writer_id] || '알 수 없음'}</span>
                    <span>{new Date(n.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <a href="/dashboard/notices" className={styles.moreLink}>공지 관리 →</a>
        </div>

        {/* ── 카드 5: 과제 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📋</span>
            과제
            {(rawAssignments || []).length > 0 && (
              <span className={styles.badge}>{(rawAssignments || []).length}건</span>
            )}
          </h2>

          {(rawAssignments || []).length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>✅</span>
              <p>등록된 과제가 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.noticeList}>
              {(rawAssignments || []).map((a: any) => (
                <li key={a.id} className={styles.noticeItem}>
                  <div className={styles.noticeTitle}>{a.title}</div>
                  <div className={styles.noticeMeta}>
                    <span>{userMap[a.writer_id] || '알 수 없음'}</span>
                    {a.due_date && (
                      <span style={{ color: '#e53e3e', fontWeight: 700 }}>
                        마감 {new Date(a.due_date).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <a href="/dashboard/notices" className={styles.moreLink}>과제 관리 →</a>
        </div>

      </div>
    </div>
  )
}
