import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import styles from './student.module.css'

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  online:          { label: '온라인 클래스', icon: '💻', color: '#00897B', bg: '#E6F7F6' },
  offline:         { label: '오프라인 합주', icon: '🎻', color: '#2B6CB0', bg: '#EBF8FF' },
  special_lecture: { label: '명사 특강',     icon: '🎓', color: '#6B46C1', bg: '#FAF5FF' },
  camp:            { label: '음악 캠프',     icon: '🏕️', color: '#C05621', bg: '#FFFAF0' },
  performance:     { label: '연주회',        icon: '🎉', color: '#6B46C1', bg: '#FAF5FF' },
  rehearsal:       { label: '리허설',        icon: '🔄', color: '#475569', bg: '#F1F5F9' },
  ot:              { label: '오리엔테이션',  icon: '👋', color: '#475569', bg: '#F1F5F9' },
}

function getDaysLeft(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function StudentDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: studentData } = await supabase
    .from('users')
    .select('role, name, cohort, class_id, instrument')
    .eq('id', user.id)
    .single()

  const role = ((studentData?.role as string) || 'student').toLowerCase()
  if (role !== 'student') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#e74c3c', marginBottom: '16px' }}>⚠️ 접근 권한 없음</h1>
        <p style={{ color: '#666' }}>학생(Student) 전용 페이지입니다.</p>
        <a href="/dashboard" style={{ color: '#00A99D', marginTop: '16px', display: 'inline-block' }}>
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  const name = studentData?.name || '학생'
  const cohort = studentData?.cohort as number | null
  const classId = studentData?.class_id as string | null
  const instrument = studentData?.instrument as string | null

  // 서버는 UTC 기준 — schedule_date가 date 타입으로 저장되므로 일관성 유지
  const todayStr = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long',
  })

  // 본인에게 해당하는 데이터 필터 (RLS 정책과 이중 보호)
  const isForMe = (item: any) => {
    if (item.target_type === 'all') return true
    if (item.target_type === 'cohort' && cohort !== null && item.target_cohort === cohort) return true
    if (item.target_type === 'class' && classId && item.target_class_id === classId) return true
    if (item.target_type === 'individual' && item.target_user_id === user.id) return true
    return false
  }

  const [
    { data: rawSchedules },
    { data: rawAssignments },
    { data: rawNotices },
  ] = await Promise.all([
    supabase
      .from('schedules')
      .select('*')
      .gte('schedule_date', todayStr)
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(20),
    supabase
      .from('notices')
      .select('*')
      .eq('type', 'assignment')
      .order('due_date', { ascending: true }),
    supabase
      .from('notices')
      .select('*')
      .eq('type', 'notice')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const upcomingSchedules = (rawSchedules || []).filter(isForMe).slice(0, 5)
  const myAssignments     = (rawAssignments || []).filter(isForMe).slice(0, 5)
  const myNotices         = (rawNotices || []).filter(isForMe).slice(0, 3)

  // 작성자/선생님 이름 일괄 조회 (FK join 대신 별도 쿼리)
  const writerIds = [...new Set([
    ...myAssignments.map((a: any) => a.writer_id),
    ...myNotices.map((n: any) => n.writer_id),
    ...upcomingSchedules.map((s: any) => s.teacher_id).filter(Boolean),
  ])]
  const { data: writerRows } = writerIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', writerIds)
    : { data: [] }
  const userMap: Record<string, string> = {}
  ;(writerRows || []).forEach((u: any) => { userMap[u.id] = u.name })

  return (
    <div className={styles.container}>

      {/* ── 웰컴 배너 ── */}
      <div className={styles.welcomeBanner}>
        <div>
          <div className={styles.welcomeGreeting}>안녕하세요, {name}님! 🎵</div>
          <div className={styles.welcomeMeta}>
            {cohort && <span>{cohort}기</span>}
            {instrument && (
              <>
                <span className={styles.sep}>·</span>
                <span>{instrument}</span>
              </>
            )}
          </div>
        </div>
        <div className={styles.welcomeDate}>{todayDisplay}</div>
      </div>

      {/* ── 3열 카드 그리드 ── */}
      <div className={styles.grid}>

        {/* 카드 1: 나의 일정 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📅</span>
            나의 일정
            <span className={styles.badge}>{upcomingSchedules.length}건</span>
          </h2>

          {upcomingSchedules.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>🎵</span>
              <p>다가오는 일정이 없어요.<br />개인 연습에 집중해 보세요!</p>
            </div>
          ) : (
            <ul className={styles.scheduleList}>
              {upcomingSchedules.map(sc => {
                const cfg = TYPE_CONFIG[sc.schedule_type] ?? { label: sc.schedule_type, icon: '📌', color: '#475569', bg: '#F1F5F9' }
                const isLink = sc.location?.startsWith('http')
                const dateStr = sc.schedule_date.substring(0, 10)
                const isToday = dateStr === todayStr
                const dateLabel = isToday
                  ? '오늘'
                  : new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
                return (
                  <li key={sc.id} className={styles.scheduleItem}>
                    <div className={styles.scheduleTime}>
                      <div className={isToday ? styles.scheduleDateToday : styles.scheduleDate}>{dateLabel}</div>
                      <div>{sc.start_time.substring(0, 5)}</div>
                    </div>
                    <div className={styles.scheduleBody}>
                      <span
                        className={styles.typeBadge}
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                      <div className={styles.scheduleTitle}>{sc.title}</div>
                      {sc.teacher_id && userMap[sc.teacher_id] && (
                        <div className={styles.scheduleMeta}>👨‍🏫 {userMap[sc.teacher_id]} 선생님</div>
                      )}
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

          <a href="/dashboard/student/schedules" className={styles.moreLink}>
            전체 일정 보기 →
          </a>
        </div>

        {/* 카드 2: 나의 과제 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📝</span>
            나의 과제
            <span className={styles.badge}>{myAssignments.length}건</span>
          </h2>

          {myAssignments.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>✅</span>
              <p>진행 중인 과제가 없어요.<br />잘 하고 있어요!</p>
            </div>
          ) : (
            <ul className={styles.assignmentList}>
              {myAssignments.map(a => {
                const daysLeft = a.due_date ? getDaysLeft(a.due_date) : null
                const isUrgent  = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3
                const isOverdue = daysLeft !== null && daysLeft < 0
                return (
                  <li
                    key={a.id}
                    className={`${styles.assignmentItem} ${isOverdue ? styles.overdue : isUrgent ? styles.urgent : ''}`}
                  >
                    <div className={styles.assignmentTitle}>{a.title}</div>
                    <div className={styles.assignmentFooter}>
                      <span className={styles.assignmentWriter}>
                        {userMap[a.writer_id] || '알 수 없음'} 선생님
                      </span>
                      {daysLeft !== null && (
                        <span className={`${styles.dueBadge} ${isOverdue ? styles.dueOverdue : isUrgent ? styles.dueUrgent : styles.dueNormal}`}>
                          {isOverdue
                            ? '마감됨'
                            : daysLeft === 0
                            ? '오늘 마감'
                            : `D-${daysLeft}`}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <a href="/dashboard/student/assignments" className={styles.moreLink}>
            전체 과제 보기 →
          </a>
        </div>

        {/* 카드 3: 공지사항 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📢</span>
            공지사항
          </h2>

          {myNotices.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📭</span>
              <p>새로운 공지사항이 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.noticeList}>
              {myNotices.map(n => (
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
        </div>

      </div>
    </div>
  )
}
