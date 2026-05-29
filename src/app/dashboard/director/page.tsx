import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

const INSTRUMENT_ORDER = ['바이올린', '비올라', '첼로', '콘트라베이스', '플루트', '클라리넷']

function getDaysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
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
        <p style={{ color: '#666' }}>디렉터(Director) 전용 페이지입니다.</p>
        <a href="/dashboard" style={{ color: '#00A99D', marginTop: '16px', display: 'inline-block' }}>
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  const name = directorData?.name || '디렉터'
  const todayStr = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  // 30일 전 날짜 (출석 통계 기준)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const [
    { data: rawSchedules },
    { data: rawStudents },
    { data: rawTeachers },
    { data: rawAttendances },
    { data: rawNotices },
  ] = await Promise.all([
    // 다음 전체 합주/공연 (target_type='all', 오늘 이후, 날짜순)
    supabase
      .from('schedules')
      .select('id, title, schedule_type, schedule_date, start_time, end_time, location')
      .eq('target_type', 'all')
      .in('schedule_type', ['offline', 'performance', 'rehearsal', 'special_lecture', 'camp', 'ot'])
      .gte('schedule_date', todayStr)
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(3),

    // 전체 학생 수 + 파트(instrument) 정보
    supabase
      .from('users')
      .select('id, instrument')
      .eq('role', 'student'),

    // 전체 선생님 수
    supabase
      .from('users')
      .select('id')
      .eq('role', 'teacher'),

    // 최근 30일 출석 기록 (student_id만)
    supabase
      .from('attendances')
      .select('student_id, status')
      .gte('date', thirtyDaysAgoStr),

    // 전체 공지 최신 3건
    supabase
      .from('notices')
      .select('id, title, type, created_at, writer:writer_id(name)')
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const schedules   = rawSchedules   || []
  const students    = rawStudents    || []
  const notices     = rawNotices     || []
  const attendances = rawAttendances || []

  const studentCount = students.length
  const teacherCount = (rawTeachers || []).length

  // ── 파트별 출석 통계 계산 ──
  // student_id → instrument 맵 생성
  const instrumentMap = new Map<string, string>()
  students.forEach((s: any) => {
    if (s.instrument) instrumentMap.set(s.id, s.instrument)
  })

  // 파트별 출석 집계
  const partStats: Record<string, { present: number; late: number; absent: number; total: number }> = {}
  attendances.forEach((a: any) => {
    const instrument = instrumentMap.get(a.student_id)
    if (!instrument) return
    if (!partStats[instrument]) partStats[instrument] = { present: 0, late: 0, absent: 0, total: 0 }
    partStats[instrument].total++
    if (a.status === 'PRESENT') partStats[instrument].present++
    else if (a.status === 'LATE') partStats[instrument].late++
    else if (a.status === 'ABSENT') partStats[instrument].absent++
  })

  // 정렬: 지정 순서 우선, 나머지는 뒤에
  const sortedParts = [
    ...INSTRUMENT_ORDER.filter(i => partStats[i]),
    ...Object.keys(partStats).filter(i => !INSTRUMENT_ORDER.includes(i)),
  ]

  return (
    <div className={styles.container}>

      {/* ── 웰컴 배너 ── */}
      <div className={styles.welcomeBanner}>
        <div>
          <div className={styles.welcomeGreeting}>안녕하세요, {name} 디렉터님! 🎻</div>
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

        {/* ── 카드 1: 다음 합주/공연 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>🎻</span>
            다음 합주 · 공연
            <span className={styles.badge}>{schedules.length}건</span>
          </h2>

          {schedules.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📭</span>
              <p>예정된 전체 합주 또는<br />공연 일정이 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.scheduleList}>
              {schedules.map((sc: any) => {
                const cfg = SCHEDULE_TYPE_CONFIG[sc.schedule_type] ?? {
                  label: sc.schedule_type, icon: '📌', color: '#475569', bg: '#F1F5F9',
                }
                const daysLeft = getDaysFromToday(sc.schedule_date)
                const dateObj = new Date(sc.schedule_date + 'T00:00:00')
                const dateLabel = dateObj.toLocaleDateString('ko-KR', {
                  month: 'long', day: 'numeric', weekday: 'short',
                })
                const isLink = sc.location?.startsWith('http')

                return (
                  <li key={sc.id} className={styles.scheduleItem}>
                    <div className={styles.scheduleTop}>
                      <span
                        className={styles.typeBadge}
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                      <span className={`${styles.daysLeft} ${daysLeft === 0 ? styles.daysToday : daysLeft <= 7 ? styles.daysSoon : ''}`}>
                        {daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
                      </span>
                    </div>
                    <div className={styles.scheduleTitle}>{sc.title}</div>
                    <div className={styles.scheduleMeta}>
                      <span>📅 {dateLabel}</span>
                      <span>⏰ {sc.start_time.substring(0, 5)} ~ {sc.end_time.substring(0, 5)}</span>
                    </div>
                    {sc.location && (
                      <div className={styles.scheduleLocation}>
                        📍{' '}
                        {isLink
                          ? <a href={sc.location} target="_blank" rel="noopener noreferrer" className={styles.locationLink}>{sc.location}</a>
                          : sc.location}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className={styles.cardFooterLinks}>
            <a href="/dashboard/schedules" className={styles.moreLink}>전체 일정 관리 →</a>
            <a href="/dashboard/scores" className={styles.moreLink}>악보 보관함 →</a>
          </div>
        </div>

        {/* ── 카드 2: 파트별 출석 통계 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📊</span>
            파트별 출석률
            <span className={styles.badgeSub}>최근 30일</span>
          </h2>

          {sortedParts.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📋</span>
              <p>최근 30일 출석 기록이<br />없습니다.</p>
            </div>
          ) : (
            <ul className={styles.partList}>
              {sortedParts.map(instrument => {
                const stat = partStats[instrument]
                const rate = stat.total > 0
                  ? Math.round((stat.present / stat.total) * 100)
                  : 0
                const isLow = rate < 70

                return (
                  <li key={instrument} className={styles.partItem}>
                    <div className={styles.partHeader}>
                      <span className={styles.partName}>{instrument}</span>
                      <span className={`${styles.partRate} ${isLow ? styles.partRateLow : ''}`}>
                        {rate}%
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${isLow ? styles.barFillLow : ''}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <div className={styles.partDetail}>
                      출석 {stat.present} · 지각 {stat.late} · 결석 {stat.absent}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>전체 출결 현황 →</a>
        </div>

        {/* ── 카드 3: 마스터 공지사항 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📢</span>
            마스터 공지사항
          </h2>

          {/* 퀵 버튼 */}
          <a href="/dashboard/notices" className={styles.newNoticeBtn}>
            + 새 공지 작성
          </a>

          {notices.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📭</span>
              <p>등록된 공지사항이 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.noticeList}>
              {notices.map((n: any) => (
                <li key={n.id} className={styles.noticeItem}>
                  <div className={styles.noticeTop}>
                    <span className={`${styles.noticeTypeBadge} ${n.type === 'assignment' ? styles.noticeAssignment : styles.noticeAnnounce}`}>
                      {n.type === 'assignment' ? '과제' : '공지'}
                    </span>
                    <span className={styles.noticeDate}>
                      {new Date(n.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <div className={styles.noticeTitle}>{n.title}</div>
                  <div className={styles.noticeWriter}>{(n.writer as any)?.name}</div>
                </li>
              ))}
            </ul>
          )}

          <a href="/dashboard/notices" className={styles.moreLink}>전체 공지 관리 →</a>
        </div>

      </div>
    </div>
  )
}
