import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CollapsibleList } from '@/components/CollapsibleList'
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

  const { data: rawClasses } = await supabase
    .from('classes')
    .select('id, student:student_id(id, name)')
    .filter('teacher_ids', 'cs', `{${user.id}}`)

  const myClassIds = (rawClasses || []).map((c: any) => c.id as string)

  // 2단계: 나머지 데이터 병렬 조회
  const scheduleFilter = myClassIds.length > 0
    ? `teacher_id.eq.${user.id},target_class_id.in.(${myClassIds.join(',')})`
    : `teacher_id.eq.${user.id}`

  const [
    { data: rawSchedules },
    { data: rawEvals },
    { data: rawAttendances },
    { data: rawAssignments },
    { data: rawNotices },
  ] = await Promise.all([
    supabase
      .from('schedules')
      .select('id, title, schedule_type, start_time, end_time, location')
      .eq('schedule_date', todayStr)
      .or(scheduleFilter)
      .order('start_time', { ascending: true }),

    supabase
      .from('evaluations')
      .select('student_id')
      .eq('writer_id', user.id)
      .gte('created_at', sevenDaysAgoStr),

    supabase
      .from('attendances')
      .select('status')
      .eq('teacher_id', user.id)
      .eq('date', todayStr),

    // 나에게 해당하는 과제 (RLS가 필터링)
    supabase
      .from('notices')
      .select('id, title, due_date, writer_id')
      .eq('type', 'assignment')
      .order('due_date', { ascending: true })
      .limit(20),

    // 나에게 해당하는 공지 (RLS가 필터링)
    supabase
      .from('notices')
      .select('id, title, created_at, writer_id')
      .eq('type', 'notice')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // 작성자 이름 조회용 userMap
  const writerIds = [...new Set([
    ...(rawAssignments || []).map((a: any) => a.writer_id),
    ...(rawNotices || []).map((n: any) => n.writer_id),
  ].filter(Boolean))]
  const { data: writerRows } = writerIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', writerIds)
    : { data: [] }
  const userMap: Record<string, string> = {}
  ;(writerRows || []).forEach((u: any) => { userMap[u.id] = u.name })

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

      {/* ── 상단 3열 그리드 ── */}
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
            <CollapsibleList
              listClassName={styles.scheduleList}
              toggleClassName={styles.moreLink}
              items={schedules.map((sc: any) => {
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
            />
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
            <CollapsibleList
              listClassName={styles.studentList}
              toggleClassName={styles.moreLink}
              items={unevaluated.map(s => (
                <li key={s.id} className={styles.studentItem}>
                  <span className={styles.studentAvatar}>{s.name.charAt(0)}</span>
                  <span className={styles.studentName}>{s.name}</span>
                  <span className={styles.pendingTag}>평가 필요</span>
                </li>
              ))}
            />
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

      {/* ── 하단 2열 그리드 ── */}
      <div className={styles.grid2}>

        {/* ── 카드 4: 과제 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📝</span>
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
            <CollapsibleList
              listClassName={styles.noticeList}
              toggleClassName={styles.moreLink}
              items={(rawAssignments || []).map((a: any) => (
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
            />
          )}

          <a href="/dashboard/notices" className={styles.moreLink}>전체 과제 보기 →</a>
        </div>

        {/* ── 카드 5: 공지사항 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>📢</span>
            공지사항
          </h2>

          {(rawNotices || []).length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📭</span>
              <p>새로운 공지사항이 없습니다.</p>
            </div>
          ) : (
            <CollapsibleList
              listClassName={styles.noticeList}
              toggleClassName={styles.moreLink}
              items={(rawNotices || []).map((n: any) => (
                <li key={n.id} className={styles.noticeItem}>
                  <div className={styles.noticeTitle}>{n.title}</div>
                  <div className={styles.noticeMeta}>
                    <span>{userMap[n.writer_id] || '알 수 없음'}</span>
                    <span>{new Date(n.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </li>
              ))}
            />
          )}

          <a href="/dashboard/notices" className={styles.moreLink}>전체 공지 보기 →</a>
        </div>

      </div>
    </div>
  )
}
