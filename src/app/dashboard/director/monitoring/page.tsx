'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './monitoring.module.css'

const SCHEDULE_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  offline:         { label: '오프라인 합주', icon: '🎻', color: '#2B6CB0' },
  performance:     { label: '연주회',        icon: '🎉', color: '#6B46C1' },
  rehearsal:       { label: '리허설',        icon: '🔄', color: '#475569' },
  online:          { label: '온라인 수업',   icon: '💻', color: '#00897B' },
  special_lecture: { label: '명사 특강',     icon: '🎓', color: '#6B46C1' },
  camp:            { label: '음악 캠프',     icon: '🏕️', color: '#C05621' },
  ot:              { label: '오리엔테이션',  icon: '👋', color: '#475569' },
}

interface TeacherStat {
  id: string
  name: string
  studentCount: number
  lastEvalDate: string | null
  unevaluatedCount: number
}

interface AtRiskStudent {
  id: string
  name: string
  instrument: string | null
  absenceCount: number
  avgScore: number | null
  reason: 'absence' | 'score' | 'both'
}

interface ScheduleItem {
  id: string
  title: string
  schedule_type: string
  schedule_date: string
  start_time: string
  location: string | null
}

export default function DirectorMonitoringPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  // 오늘 출결
  const [todayPresent, setTodayPresent] = useState(0)
  const [todayLate, setTodayLate]    = useState(0)
  const [todayAbsent, setTodayAbsent] = useState(0)
  const [absentStudents, setAbsentStudents] = useState<{ name: string }[]>([])

  // 요약 통계
  const [totalStudents, setTotalStudents] = useState(0)
  const [totalTeachers, setTotalTeachers] = useState(0)
  const [upcomingCount, setUpcomingCount] = useState(0)

  // 카드 데이터
  const [teacherStats, setTeacherStats] = useState<TeacherStat[]>([])
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([])
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])

  const todayStr = new Date().toISOString().split('T')[0]
  const todayDisplay = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    try {
      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const thirtyAgoStr = thirtyAgo.toISOString().split('T')[0]

      const thirtyForward = new Date()
      thirtyForward.setDate(thirtyForward.getDate() + 30)
      const thirtyForwardStr = thirtyForward.toISOString().split('T')[0]

      const sevenAgo = new Date()
      sevenAgo.setDate(sevenAgo.getDate() - 7)
      const sevenAgoStr = sevenAgo.toISOString()

      const [
        { data: todayAtt },
        { data: allStudents },
        { data: allTeachers },
        { data: recentAtt },
        { data: recentEvals },
        { data: upcomingSchedules },
        { data: classRows },
      ] = await Promise.all([
        // 오늘 출결
        supabase
          .from('attendances')
          .select('status, student:student_id(name)')
          .eq('date', todayStr),

        // 전체 학생
        supabase.from('users').select('id, name, instrument').eq('role', 'student').eq('is_active', true),

        // 전체 교사
        supabase.from('users').select('id, name').eq('role', 'teacher').eq('is_active', true),

        // 최근 30일 출석 (학생별 결석 집계용)
        supabase
          .from('attendances')
          .select('student_id, status')
          .gte('date', thirtyAgoStr),

        // 최근 30일 평가 (학생별 평균 점수 + 교사별 마지막 평가일)
        supabase
          .from('evaluations')
          .select('student_id, writer_id, score, created_at')
          .gte('created_at', thirtyAgo.toISOString()),

        // 다가오는 30일 일정
        supabase
          .from('schedules')
          .select('id, title, schedule_type, schedule_date, start_time, location')
          .gte('schedule_date', todayStr)
          .lte('schedule_date', thirtyForwardStr)
          .order('schedule_date', { ascending: true })
          .order('start_time',    { ascending: true })
          .limit(10),

        // 교사-학생 배정 (classes)
        supabase
          .from('classes')
          .select('student_id, teacher_ids'),
      ])

      // ── 오늘 출결 ──
      const attArr = todayAtt || []
      setTodayPresent(attArr.filter((a: any) => a.status === 'PRESENT').length)
      setTodayLate(attArr.filter((a: any) => a.status === 'LATE').length)
      setTodayAbsent(attArr.filter((a: any) => a.status === 'ABSENT').length)
      setAbsentStudents(
        attArr.filter((a: any) => a.status === 'ABSENT').map((a: any) => ({ name: (a.student as any)?.name ?? '알 수 없음' }))
      )

      // ── 요약 ──
      const studentCount = (allStudents || []).length
      const teacherCount = (allTeachers || []).length
      setTotalStudents(studentCount)
      setTotalTeachers(teacherCount)
      setUpcomingCount((upcomingSchedules || []).length)

      // ── 교사별 통계 ──
      const teacherStudentMap: Record<string, Set<string>> = {}
      ;(classRows || []).forEach((c: any) => {
        const sid = c.student_id
        if (!sid) return
        ;(c.teacher_ids || []).forEach((tid: string) => {
          if (!teacherStudentMap[tid]) teacherStudentMap[tid] = new Set()
          teacherStudentMap[tid].add(sid)
        })
      })

      // 교사별 마지막 평가일 + 미평가 학생 수
      const evalsByTeacher: Record<string, { lastDate: string; evaluatedIds: Set<string> }> = {}
      ;(recentEvals || []).forEach((ev: any) => {
        if (!ev.writer_id) return
        if (!evalsByTeacher[ev.writer_id]) {
          evalsByTeacher[ev.writer_id] = { lastDate: ev.created_at, evaluatedIds: new Set() }
        }
        if (ev.created_at > evalsByTeacher[ev.writer_id].lastDate) {
          evalsByTeacher[ev.writer_id].lastDate = ev.created_at
        }
        evalsByTeacher[ev.writer_id].evaluatedIds.add(ev.student_id)
      })

      const tStats: TeacherStat[] = (allTeachers || []).map((t: any) => {
        const myStudents = teacherStudentMap[t.id] || new Set()
        const evalData   = evalsByTeacher[t.id]
        const unevaluated = evalData
          ? [...myStudents].filter(sid => !evalData.evaluatedIds.has(sid)).length
          : myStudents.size
        return {
          id: t.id,
          name: t.name,
          studentCount: myStudents.size,
          lastEvalDate: evalData?.lastDate ?? null,
          unevaluatedCount: unevaluated,
        }
      }).sort((a: TeacherStat, b: TeacherStat) => b.studentCount - a.studentCount)

      setTeacherStats(tStats)

      // ── 요주의 학생 ──
      // 30일 결석 횟수
      const absenceMap: Record<string, number> = {}
      ;(recentAtt || []).forEach((a: any) => {
        if (a.status === 'ABSENT') {
          absenceMap[a.student_id] = (absenceMap[a.student_id] || 0) + 1
        }
      })

      // 30일 평가 평균 점수
      const scoreMap: Record<string, { sum: number; cnt: number }> = {}
      ;(recentEvals || []).forEach((ev: any) => {
        if (!ev.student_id || ev.score == null) return
        if (!scoreMap[ev.student_id]) scoreMap[ev.student_id] = { sum: 0, cnt: 0 }
        scoreMap[ev.student_id].sum += ev.score
        scoreMap[ev.student_id].cnt++
      })

      const studentMap: Record<string, { name: string; instrument: string | null }> = {}
      ;(allStudents || []).forEach((s: any) => { studentMap[s.id] = { name: s.name, instrument: s.instrument } })

      const risks: AtRiskStudent[] = []
      const allStudentIds = new Set([
        ...Object.keys(absenceMap),
        ...Object.keys(scoreMap),
      ])

      allStudentIds.forEach(sid => {
        const absent = absenceMap[sid] || 0
        const sc     = scoreMap[sid]
        const avg    = sc ? sc.sum / sc.cnt : null
        const highAbsence = absent >= 3
        const lowScore    = avg !== null && avg <= 2.5

        if (!highAbsence && !lowScore) return
        if (!studentMap[sid]) return

        risks.push({
          id: sid,
          name: studentMap[sid].name,
          instrument: studentMap[sid].instrument,
          absenceCount: absent,
          avgScore: avg !== null ? Math.round(avg * 10) / 10 : null,
          reason: highAbsence && lowScore ? 'both' : highAbsence ? 'absence' : 'score',
        })
      })

      risks.sort((a, b) => b.absenceCount - a.absenceCount || (a.avgScore ?? 5) - (b.avgScore ?? 5))
      setAtRiskStudents(risks)

      setSchedules(upcomingSchedules || [])
    } catch (err) {
      console.error('모니터링 데이터 로딩 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatEvalDate = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return '오늘'
    if (diffDays === 1) return '어제'
    if (diffDays < 7)  return `${diffDays}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
  }

  const getDaysFromToday = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) return <div className={styles.loading}>오케스트라 현황을 분석 중입니다...</div>

  const todayTotal = todayPresent + todayLate + todayAbsent
  const attendanceRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : null

  return (
    <div className={styles.container}>

      {/* ── 헤더 배너 ── */}
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <div className={styles.bannerTitle}>📊 전체 모니터링</div>
          <div className={styles.bannerDate}>{todayDisplay}</div>
        </div>
        <div className={styles.bannerSummary}>
          <div className={styles.summaryChip}>
            <span className={styles.summaryNum}>{totalStudents}</span>
            <span className={styles.summaryLabel}>전체 단원</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryChip}>
            <span className={styles.summaryNum}>{totalTeachers}</span>
            <span className={styles.summaryLabel}>선생님</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryChip}>
            <span className={styles.summaryNum} style={{ color: atRiskStudents.length > 0 ? '#FFF176' : 'white' }}>
              {atRiskStudents.length}
            </span>
            <span className={styles.summaryLabel}>요주의 학생</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryChip}>
            <span className={styles.summaryNum}>{upcomingCount}</span>
            <span className={styles.summaryLabel}>예정 일정</span>
          </div>
        </div>
      </div>

      {/* ── 3열 카드 그리드 ── */}
      <div className={styles.grid}>

        {/* 카드 1: 오늘의 출결 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>✅</span>오늘의 출결
            {attendanceRate !== null && (
              <span className={styles.badge}>{attendanceRate}% 출석</span>
            )}
          </h2>

          <div className={styles.statRow}>
            <div className={`${styles.statBox} ${styles.statPresent}`}>
              <span className={styles.statNum}>{todayPresent}</span>
              <span className={styles.statLabel}>출석</span>
            </div>
            <div className={`${styles.statBox} ${styles.statLate}`}>
              <span className={styles.statNum}>{todayLate}</span>
              <span className={styles.statLabel}>지각</span>
            </div>
            <div className={`${styles.statBox} ${styles.statAbsent}`}>
              <span className={styles.statNum}>{todayAbsent}</span>
              <span className={styles.statLabel}>결석</span>
            </div>
          </div>

          {todayTotal === 0 ? (
            <div className={styles.emptySmall}>오늘 등록된 출결 데이터가 없습니다.</div>
          ) : (
            <>
              <div className={styles.sectionLabel}>오늘 결석 학생</div>
              {absentStudents.length === 0 ? (
                <div className={styles.emptySmall}>✅ 결석자 없음</div>
              ) : (
                <ul className={styles.absenceList}>
                  {absentStudents.map((s, i) => (
                    <li key={i} className={styles.absenceItem}>
                      <span className={styles.absenceName}>{s.name}</span>
                      <span className={styles.absenceBadge}>결석</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <a href="/dashboard/evaluations" className={styles.moreLink}>전체 출결 관리 →</a>
        </div>

        {/* 카드 2: 요주의 학생 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>⚠️</span>요주의 학생
            <span className={styles.badgeSub}>최근 30일</span>
          </h2>

          {atRiskStudents.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>🌟</span>
              <p>주의가 필요한 학생이<br />없습니다. 모두 잘 하고 있어요!</p>
            </div>
          ) : (
            <ul className={styles.riskList}>
              {atRiskStudents.map(s => (
                <li key={s.id} className={styles.riskItem}>
                  <div className={styles.riskAvatar}>{s.name.charAt(0)}</div>
                  <div className={styles.riskInfo}>
                    <div className={styles.riskName}>{s.name}</div>
                    {s.instrument && <div className={styles.riskInstrument}>{s.instrument}</div>}
                  </div>
                  <div className={styles.riskTags}>
                    {s.absenceCount >= 3 && (
                      <span className={styles.riskTagAbsence}>결석 {s.absenceCount}회</span>
                    )}
                    {s.avgScore !== null && s.avgScore <= 2.5 && (
                      <span className={styles.riskTagScore}>평균 {s.avgScore}점</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <a href="/dashboard/members" className={styles.moreLink}>전체 단원 명부 →</a>
        </div>

        {/* 카드 3: 선생님 현황 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span>👩‍🏫</span>선생님 현황
            <span className={styles.badge}>{teacherStats.length}명</span>
          </h2>

          {teacherStats.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>👤</span>
              <p>등록된 선생님이 없습니다.</p>
            </div>
          ) : (
            <ul className={styles.teacherList}>
              {teacherStats.map(t => {
                const lastEval = formatEvalDate(t.lastEvalDate)
                const evalStale = !t.lastEvalDate || (
                  (Date.now() - new Date(t.lastEvalDate).getTime()) > 7 * 24 * 60 * 60 * 1000
                )
                return (
                  <li key={t.id} className={styles.teacherItem}>
                    <div className={styles.teacherAvatar}>{t.name.charAt(0)}</div>
                    <div className={styles.teacherInfo}>
                      <div className={styles.teacherName}>{t.name} 선생님</div>
                      <div className={styles.teacherMeta}>담당 {t.studentCount}명</div>
                    </div>
                    <div className={styles.teacherRight}>
                      {t.unevaluatedCount > 0 && (
                        <span className={styles.unevalBadge}>미평가 {t.unevaluatedCount}</span>
                      )}
                      <span className={evalStale ? styles.evalDateStale : styles.evalDateOk}>
                        {lastEval ? `${lastEval} 평가` : '평가 없음'}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <a href="/dashboard/evaluations" className={styles.moreLink}>강의평가 전체 보기 →</a>
        </div>

      </div>

      {/* ── 다가오는 일정 (풀 너비) ── */}
      <div className={styles.scheduleCard}>
        <h2 className={styles.cardTitle}>
          <span>🗓</span>다가오는 일정
          <span className={styles.badgeSub}>30일 이내</span>
          <a href="/dashboard/schedules" className={styles.scheduleAllLink}>전체 보기 →</a>
        </h2>

        {schedules.length === 0 ? (
          <div className={styles.emptySmall}>예정된 일정이 없습니다.</div>
        ) : (
          <div className={styles.scheduleGrid}>
            {schedules.map(sc => {
              const cfg = SCHEDULE_TYPE_CONFIG[sc.schedule_type] ?? { label: sc.schedule_type, icon: '📌', color: '#475569' }
              const days = getDaysFromToday(sc.schedule_date)
              const dateLabel = new Date(sc.schedule_date + 'T00:00:00').toLocaleDateString('ko-KR', {
                month: 'numeric', day: 'numeric', weekday: 'short',
              })
              return (
                <div key={sc.id} className={styles.scheduleItem}>
                  <div className={`${styles.dDayBadge} ${days === 0 ? styles.dDayToday : days <= 7 ? styles.dDaySoon : ''}`}>
                    {days === 0 ? 'D-Day' : `D-${days}`}
                  </div>
                  <div className={styles.scheduleBody}>
                    <div className={styles.scheduleType} style={{ color: cfg.color }}>
                      {cfg.icon} {cfg.label}
                    </div>
                    <div className={styles.scheduleTitle}>{sc.title}</div>
                    <div className={styles.scheduleMeta}>
                      {dateLabel} {sc.start_time.substring(0, 5)}
                      {sc.location && ` · 📍 ${sc.location}`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
