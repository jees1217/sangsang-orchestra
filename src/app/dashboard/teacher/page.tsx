import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import styles from './teacher.module.css'

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  online:          { label: '온라인 수업',   icon: '💻', color: '#00897B', bg: '#E6F7F6' },
  offline:         { label: '오프라인 합주', icon: '🎻', color: '#2B6CB0', bg: '#EBF8FF' },
  special_lecture: { label: '명사 특강',     icon: '🎓', color: '#6B46C1', bg: '#FAF5FF' },
  camp:            { label: '음악 캠프',     icon: '🏕️', color: '#C05621', bg: '#FFFAF0' },
  performance:     { label: '연주회',        icon: '🎉', color: '#6B46C1', bg: '#FAF5FF' },
  rehearsal:       { label: '리허설',        icon: '🔄', color: '#475569', bg: '#F1F5F9' },
  ot:              { label: '오리엔테이션',  icon: '👋', color: '#475569', bg: '#F1F5F9' },
}

export default async function TeacherDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teacherData } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  const role = ((teacherData?.role as string) || 'teacher').toLowerCase()
  if (role !== 'teacher') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#e74c3c', marginBottom: '16px' }}>⚠️ 접근 권한 없음</h1>
        <p style={{ color: '#666' }}>교사(Teacher) 전용 페이지입니다.</p>
        <a href="/dashboard" style={{ color: '#00A99D', marginTop: '16px', display: 'inline-block' }}>
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  const name = teacherData?.name || '선생님'

  const todayStr = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  // 7일 전 ISO 문자열 (미평가 기준)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  const [
    { data: rawSchedules },
    { data: rawClasses },
    { data: rawEvals },
    { data: rawAttendances },
  ] = await Promise.all([
    // 오늘 담당 수업 (teacher_id 직접 배정된 일정)
    supabase
      .from('schedules')
      .select('id, title, schedule_type, start_time, end_time, location')
      .eq('teacher_id', user.id)
      .eq('schedule_date', todayStr)
      .order('start_time', { ascending: true }),

    // 담당 학생 목록 (teacher_id / professor_id / instructor_id 모두 커버)
    supabase
      .from('classes')
      .select('student:student_id(id, name)')
      .or(`teacher_id.eq.${user.id},professor_id.eq.${user.id},instructor_id.eq.${user.id}`),

    // 최근 7일 내 내가 작성한 평가 → 평가한 student_id 목록
    supabase
      .from('evaluations')
      .select('student_id')
      .eq('writer_id', user.id)
      .gte('created_at', sevenDaysAgoStr),

    // 오늘 출석 현황
    supabase
      .from('attendances')
      .select('status')
      .eq('teacher_id', user.id)
      .eq('date', todayStr),
  ])

  // 담당 학생 목록 정리 (중복 제거)
  const studentMap = new Map<string, { id: string; name: string }>()
  ;(rawClasses || []).forEach((c: any) => {
    if (c.student?.id) studentMap.set(c.student.id, c.student)
  })
  const students = Array.from(studentMap.values())

  // 최근 7일 내 평가한 학생 ID 셋
  const evaluatedIds = new Set((rawEvals || []).map((e: any) => e.student_id))

  // 미평가 학생
  const unevaluated = students.filter(s => !evaluatedIds.has(s.id))

  // 출석 집계
  const present = (rawAttendances || []).filter((a: any) => a.status === 'PRESENT').length
  const late    = (rawAttendances || []).filter((a: any) => a.status === 'LATE').length
  const absent  = (rawAttendances || []).filter((a: any) => a.status === 'ABSENT').length
  const hasAttendance = (rawAttendances || []).length > 0

  const schedules = rawSchedules || []

  return (
    <div className={styles.container}>

      {/* ── 웰컴 배너 ── */}
      <div className={styles.welcomeBanner}>
        <div>
          <div className={styles.welcomeGreeting}>안녕하세요, {name} 선생님! 🎼</div>
          <div className={styles.welcomeMeta}>담당 학생 {students.length}명</div>
        </div>
        <div className={styles.welcomeDate}>{todayDisplay}</div>
      </div>

      {/* ── 3열 카드 그리드 ── */}
      <div className={styles.grid}>

        {/* ── 카드 1: 오늘의 수업 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📅</span>
            오늘의 수업
            <span className={styles.badge}>{schedules.length}건</span>
          </h2>

          {schedules.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>☕</span>
              <p>오늘 배정된 수업이 없습니다.<br />여유로운 하루 되세요!</p>
            </div>
          ) : (
            <ul className={styles.scheduleList}>
              {schedules.map((sc: any) => {
                const cfg = TYPE_CONFIG[sc.schedule_type] ?? {
                  label: sc.schedule_type, icon: '📌', color: '#475569', bg: '#F1F5F9',
                }
                const isLink = sc.location?.startsWith('http')
                return (
                  <li key={sc.id} className={styles.scheduleItem}>
                    <div className={styles.scheduleTime}>{sc.start_time.substring(0, 5)}</div>
                    <div className={styles.scheduleBody}>
                      <span
                        className={styles.typeBadge}
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                      <div className={styles.scheduleTitle}>{sc.title}</div>
                      {sc.location && !isLink && (
                        <div className={styles.scheduleMeta}>📍 {sc.location}</div>
                      )}
                      {isLink && (
                        <a
                          href={sc.location}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.joinBtn}
                        >
                          수업 입장하기 →
                        </a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <a href="/dashboard/schedules" className={styles.moreLink}>전체 일정 보기 →</a>
        </div>

        {/* ── 카드 2: 이번 주 미평가 학생 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📝</span>
            이번 주 미평가 학생
            {unevaluated.length > 0 && (
              <span className={`${styles.badge} ${styles.badgeWarn}`}>
                {unevaluated.length}명
              </span>
            )}
          </h2>

          {students.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>👥</span>
              <p>배정된 학생이 없습니다.</p>
            </div>
          ) : unevaluated.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>✅</span>
              <p>이번 주 모든 학생의<br />평가를 완료했습니다!</p>
            </div>
          ) : (
            <ul className={styles.studentList}>
              {unevaluated.map(s => (
                <li key={s.id} className={styles.studentItem}>
                  <span className={styles.studentAvatar}>{s.name.charAt(0)}</span>
                  <span className={styles.studentName}>{s.name}</span>
                  <span className={styles.pendingTag}>평가 필요</span>
                </li>
              ))}
            </ul>
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>평가 작성하러 가기 →</a>
        </div>

        {/* ── 카드 3: 오늘 출석 현황 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>✅</span>
            오늘 출석 현황
          </h2>

          {!hasAttendance ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📋</span>
              <p>오늘 출석이 아직<br />등록되지 않았습니다.</p>
            </div>
          ) : (
            <div className={styles.attendanceSummary}>
              <div className={`${styles.attendanceRow} ${styles.present}`}>
                <div className={styles.attendanceLabelWrap}>
                  <span className={styles.attendanceDot} />
                  <span className={styles.attendanceLabel}>출석</span>
                </div>
                <span className={styles.attendanceCount}>{present}명</span>
              </div>
              <div className={`${styles.attendanceRow} ${styles.late}`}>
                <div className={styles.attendanceLabelWrap}>
                  <span className={styles.attendanceDot} />
                  <span className={styles.attendanceLabel}>지각</span>
                </div>
                <span className={styles.attendanceCount}>{late}명</span>
              </div>
              <div className={`${styles.attendanceRow} ${styles.absent}`}>
                <div className={styles.attendanceLabelWrap}>
                  <span className={styles.attendanceDot} />
                  <span className={styles.attendanceLabel}>결석</span>
                </div>
                <span className={styles.attendanceCount}>{absent}명</span>
              </div>
              <div className={styles.attendanceTotal}>
                총 {present + late + absent}명 등록
              </div>
            </div>
          )}

          <a href="/dashboard/evaluations" className={styles.moreLink}>출결/평가 관리 →</a>
        </div>

      </div>
    </div>
  )
}
