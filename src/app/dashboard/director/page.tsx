import { createClient } from '@/lib/supabase/server'
import { fetchCurrentTerm, scopeToTerm } from '@/lib/attendance'
import { redirect } from 'next/navigation'
import { CollapsibleList } from '@/components/CollapsibleList'
import styles from './director.module.css'

const SCHEDULE_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  offline:         { label: '오프라인 합주', icon: '🎻', color: '#2B6CB0', bg: '#EBF8FF' },
  performance:     { label: '연주회',        icon: '🎉', color: '#6B46C1', bg: '#FAF5FF' },
  rehearsal:       { label: '리허설',        icon: '🔄', color: '#475569', bg: '#F1F5F9' },
  online:          { label: '온라인 수업',   icon: '💻', color: '#00897B', bg: '#E6F7F6' },
  special_lecture: { label: '명사 특강',     icon: '🎓', color: '#6B46C1', bg: '#FAF5FF' },
  camp:            { label: '음악 캠프',     icon: '🏕️', color: '#C05621', bg: '#FFFAF0' },
  ot:              { label: '오리엔테이션',  icon: '👋', color: '#475569', bg: '#F1F5F9' },
}

const QUICK_MENUS = [
  { label: '+ 공지사항 작성', href: '/dashboard/notices',    style: 'primary' },
  { label: '단원 명부',       href: '/dashboard/members',    style: 'outline' },
  { label: '전체 통계',       href: '/dashboard/admin/stats',style: 'outline' },
  { label: '악보 관리',       href: '/dashboard/scores',     style: 'outline' },
]

function getDaysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function DirectorDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: directorData } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const role = ((directorData?.role as string) || '').toLowerCase()
  if (role !== 'director') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#e74c3c', marginBottom: '16px' }}>⚠️ 접근 권한 없음</h1>
        <p style={{ color: '#666' }}>옵저버(Observer) 전용 페이지입니다.</p>
        <a href="/dashboard" style={{ color: '#00A99D', marginTop: '16px', display: 'inline-block' }}>
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  const name = directorData?.name || '옵저버'
  const todayStr = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  // 출결 집계 구간 = 진행 중인 기수 (미설정이면 전 기간)
  const term = await fetchCurrentTerm(supabase)
  const termLabel = term ? `${term.term}기` : '전 기간'

  const [
    { data: rawStudents },
    { data: rawTeachers },
    { data: rawAttendances },
    { data: rawEvals },
    { data: rawSchedules },
  ] = await Promise.all([
    // 전체 학생 수
    supabase.from('users').select('id').eq('role', 'student'),

    // 전체 선생님 수
    supabase.from('users').select('id').eq('role', 'teacher'),

    // 기수 구간 출석 전체 (stats + 결석자 리스트 모두 처리)
    scopeToTerm(supabase
      .from('attendances')
      .select('status, date, student:student_id(name)'), term)
      .order('date', { ascending: false }),

    // 최신 강의평가
    supabase
      .from('evaluations')
      .select('id, score, comment, created_at, writer:writer_id(name), student:student_id(name)')
      .order('created_at', { ascending: false })
      .limit(20),

    // 다가오는 일정
    supabase
      .from('schedules')
      .select('id, title, schedule_type, schedule_date, start_time, location')
      .gte('schedule_date', todayStr)
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(20),
  ])

  const studentCount  = (rawStudents  || []).length
  const teacherCount  = (rawTeachers  || []).length
  const attendances   = rawAttendances || []
  const evaluations   = rawEvals       || []
  const schedules     = rawSchedules   || []

  // ── 출결 집계 ──
  const present = attendances.filter((a: any) => a.status === 'PRESENT').length
  const late    = attendances.filter((a: any) => a.status === 'LATE').length
  const absent  = attendances.filter((a: any) => a.status === 'ABSENT').length
  const total   = attendances.length

  // 결석자 최근 20건
  const recentAbsences = attendances
    .filter((a: any) => a.status === 'ABSENT')
    .slice(0, 20)

  return (
    <div className={styles.container}>

      {/* ── 웰컴 배너 ── */}
      <div className={styles.welcomeBanner}>
        <div>
          <div className={styles.welcomeGreeting}>안녕하세요, {name} 옵저버님! 🎻</div>
          <div className={styles.welcomeMeta}>
            <span>전체 단원 {studentCount}명</span>
            <span className={styles.sep}>·</span>
            <span>선생님 {teacherCount}명</span>
          </div>
        </div>
        <div className={styles.welcomeDate}>{todayDisplay}</div>
      </div>

      {/* ── 3열 카드 그리드 ── */}
      <div className={styles.grid}>

        {/* ── 카드 1: 전체 출결 현황 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📊</span>
            전체 출결 현황
            <span className={styles.badgeSub}>{termLabel}</span>
          </h2>

          {/* 숫자 요약 */}
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

          {/* 결석자 리스트 */}
          <div className={styles.sectionLabel}>최근 결석자</div>
          {recentAbsences.length === 0 ? (
            <div className={styles.emptySmall}>✅ 최근 결석자가 없습니다.</div>
          ) : (
            <CollapsibleList
              listClassName={styles.absenceList}
              toggleClassName={styles.moreLink}
              items={recentAbsences.map((a: any, i: number) => {
                const dateObj = new Date(a.date + 'T00:00:00')
                const dateLabel = dateObj.toLocaleDateString('ko-KR', {
                  month: 'numeric', day: 'numeric', weekday: 'short',
                })
                return (
                  <li key={i} className={styles.absenceItem}>
                    <span className={styles.absenceName}>{(a.student as any)?.name ?? '알 수 없음'}</span>
                    <span className={styles.absenceDate}>{dateLabel}</span>
                  </li>
                )
              })}
            />
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>전체 출결 관리 →</a>
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
            <CollapsibleList
              listClassName={styles.evalList}
              toggleClassName={styles.moreLink}
              items={evaluations.map((ev: any) => {
                const score   = ev.score ?? 0
                const comment = ev.comment ?? ''
                const preview = comment.length > 55 ? comment.substring(0, 55) + '…' : comment
                const dateLabel = new Date(ev.created_at).toLocaleDateString('ko-KR')
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
            />
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>전체 평가 내역 →</a>
        </div>

        {/* ── 카드 3: 일정 & 퀵 메뉴 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>🗓</span>
            다음 일정 & 퀵 메뉴
          </h2>

          {/* 다가오는 일정 */}
          {schedules.length === 0 ? (
            <div className={styles.emptySmall}>예정된 일정이 없습니다.</div>
          ) : (
            <CollapsibleList
              listClassName={styles.miniScheduleList}
              toggleClassName={styles.scheduleMoreLink}
              items={schedules.map((sc: any) => {
                const cfg = SCHEDULE_TYPE_CONFIG[sc.schedule_type] ?? {
                  label: sc.schedule_type, icon: '📌', color: '#475569', bg: '#F1F5F9',
                }
                const daysLeft = getDaysFromToday(sc.schedule_date)
                return (
                  <li key={sc.id} className={styles.miniScheduleItem}>
                    <span
                      className={`${styles.miniDays} ${daysLeft === 0 ? styles.daysToday : daysLeft <= 7 ? styles.daysSoon : ''}`}
                    >
                      {daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
                    </span>
                    <div className={styles.miniScheduleBody}>
                      <span className={styles.miniScheduleType} style={{ color: cfg.color }}>
                        {cfg.icon}
                      </span>
                      <div>
                        <div className={styles.miniScheduleTitle}>{sc.title}</div>
                        {sc.location && (
                          <div className={styles.miniScheduleMeta}>📍 {sc.location}</div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            />
          )}

          <a href="/dashboard/schedules" className={styles.scheduleMoreLink}>전체 일정 보기 →</a>

          {/* 구분선 */}
          <div className={styles.divider} />

          {/* 퀵 메뉴 버튼 */}
          <div className={styles.quickMenuGrid}>
            {QUICK_MENUS.map(menu => (
              <a
                key={menu.href}
                href={menu.href}
                className={menu.style === 'primary' ? styles.quickBtnPrimary : styles.quickBtnOutline}
              >
                {menu.label}
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
