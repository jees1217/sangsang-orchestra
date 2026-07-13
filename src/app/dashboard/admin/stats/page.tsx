'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './stats.module.css'

// 일정 유형별 라벨/아이콘 (시수 현황 표시용)
const SCHEDULE_TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  online:          { label: '온라인 수업',  icon: '💻' },
  offline:         { label: '오프라인 합주', icon: '🎻' },
  special_lecture: { label: '명사 특강',    icon: '🎓' },
  camp:            { label: '음악 캠프',    icon: '🏕️' },
  performance:     { label: '연주회',       icon: '🎉' },
  rehearsal:       { label: '리허설',       icon: '🔄' },
  ot:              { label: '오리엔테이션',  icon: '👋' },
}
const SCHEDULE_TYPE_ORDER = ['online', 'offline', 'special_lecture', 'camp', 'performance', 'rehearsal', 'ot']

// 'HH:MM(:SS)' 두 시각의 차이를 분 단위로 계산
function diffMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins : 0
}

// 분 → '3시간 30분' / '2시간' / '45분' 형태로 표기
function formatDuration(mins: number): string {
  if (mins <= 0) return '0분'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

export default function AdminStatsPage() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'personnel' | 'instruments' | 'evaluations' | 'hours'>('personnel')
  const [selectedCohort, setSelectedCohort] = useState<string>('all') // 기수 필터 상태 ('all' 또는 '1', '2' 등)
  const [selectedMonth, setSelectedMonth] = useState<string>('all')    // 시수 탭 기간 필터 ('all' 또는 'YYYY-MM')

  // DB에서 긁어온 원본 데이터 (필터링 전)
  const [rawData, setRawData] = useState<{ users: any[], evals: any[], classes: any[], schedules: any[] }>({ users: [], evals: [], classes: [], schedules: [] })

  // 화면에 보여줄 가공된 통계 데이터
  const [stats, setStats] = useState({ totalStudents: 0, totalTeachers: 0, unassignedStudents: 0, avgScore: 0, totalEvaluations: 0 })
  const [recentEvaluations, setRecentEvaluations] = useState<any[]>([])
  const [classStats, setClassStats] = useState<any[]>([])
  const [instrumentStats, setInstrumentStats] = useState<any[]>([])

  const supabase = createClient()

  // 1. 페이지 접속 시 딱 한 번 원본 데이터를 모두 불러옴
  useEffect(() => {
    fetchRawData()
  }, [])

  // 2. 기수 필터(selectedCohort)가 바뀔 때마다 데이터를 다시 계산함
  useEffect(() => {
    if (rawData.users.length > 0 || rawData.classes.length > 0) {
      calculateStats()
    }
  }, [selectedCohort, rawData])

  const fetchRawData = async () => {
    try {
      // 유저 데이터 (cohort, instrument 포함)
      const { data: users } = await supabase.from('users').select('id, role, class_id, cohort, instrument').eq('is_active', true)
      
      // 평가 데이터 (어떤 학생의 평가인지 cohort까지 가져옴)
      const { data: evaluations } = await supabase
        .from('evaluations')
        .select('id, score, comment, created_at, student:student_id(name, cohort), writer:writer_id(name)')
        .order('created_at', { ascending: false })

      // 반 데이터
      const { data: classes } = await supabase.from('classes').select('id, name')

      // 일정 데이터 (시수 집계용 — 담당 선생님 이름 포함)
      const { data: schedules } = await supabase
        .from('schedules')
        .select('id, schedule_type, schedule_date, start_time, end_time, teacher_id, teacher:teacher_id(name)')
        .order('schedule_date', { ascending: false })

      setRawData({
        users: users || [],
        evals: evaluations || [],
        classes: classes || [],
        schedules: schedules || []
      })
    } catch (error) {
      console.error('통계 데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 필터에 맞춰 통계 계산하는 핵심 마법
  const calculateStats = () => {
    const { users, evals, classes } = rawData

    // 기수 필터링
    const isAll = selectedCohort === 'all'
    const targetCohort = Number(selectedCohort)

    const teachers = users.filter(u => u.role === 'teacher')
    
    // 선택된 기수의 학생만 필터링
    const filteredStudents = users.filter(u => 
      u.role === 'student' && (isAll || u.cohort === targetCohort)
    )

    // 선택된 기수의 학생에 대한 평가만 필터링
    const filteredEvals = evals.filter(e => 
      isAll || e.student?.cohort === targetCohort
    )

    // 1. 요약 카드용 계산
    const unassigned = filteredStudents.filter(s => !s.class_id).length
    const totalScore = filteredEvals.reduce((sum, ev) => sum + ev.score, 0)
    const avg = filteredEvals.length > 0 ? (totalScore / filteredEvals.length).toFixed(1) : 0

    // 2. 반별 학생 수 계산 (해당 기수 학생들 기준)
    const classData = classes.map(cls => {
      const count = filteredStudents.filter(s => s.class_id === cls.id).length
      return { name: cls.name, count }
    }).filter(c => c.count > 0) // 학생이 1명이라도 있는 반만 보여줌
    .sort((a, b) => b.count - a.count)

    // 3. 악기별 학생 수 계산
    const instrMap: Record<string, number> = {}
    filteredStudents.forEach(s => {
      const inst = s.instrument || '미정'
      instrMap[inst] = (instrMap[inst] || 0) + 1
    })
    const instrumentData = Object.entries(instrMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    // 계산 끝! 상태 업데이트
    setStats({
      totalStudents: filteredStudents.length,
      totalTeachers: teachers.length, // 선생님은 전체 숫자를 고정으로 보여줌
      unassignedStudents: unassigned,
      avgScore: Number(avg),
      totalEvaluations: filteredEvals.length
    })
    setRecentEvaluations(filteredEvals.slice(0, 5))
    setClassStats(classData)
    setInstrumentStats(instrumentData)
  }

  // ── 시수 집계 (기간 필터 반영) ──
  // 데이터에 존재하는 월 목록 (최신순)
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    rawData.schedules.forEach(s => {
      if (s.schedule_date) set.add(s.schedule_date.substring(0, 7))
    })
    return Array.from(set).sort().reverse()
  }, [rawData.schedules])

  // 선택된 기간의 일정만 필터
  const filteredSchedules = useMemo(() => {
    if (selectedMonth === 'all') return rawData.schedules
    return rawData.schedules.filter(s => (s.schedule_date || '').substring(0, 7) === selectedMonth)
  }, [rawData.schedules, selectedMonth])

  // 유형별 시수 (횟수 + 총 시간)
  const typeHours = useMemo(() => {
    const map: Record<string, { count: number; minutes: number }> = {}
    filteredSchedules.forEach(s => {
      const t = s.schedule_type || 'etc'
      if (!map[t]) map[t] = { count: 0, minutes: 0 }
      map[t].count += 1
      map[t].minutes += diffMinutes(s.start_time, s.end_time)
    })
    // 정의된 순서대로 정렬, 미정의 유형은 뒤에 붙임
    const known = SCHEDULE_TYPE_ORDER.filter(t => map[t]).map(t => ({ type: t, ...map[t] }))
    const unknown = Object.keys(map).filter(t => !SCHEDULE_TYPE_ORDER.includes(t)).map(t => ({ type: t, ...map[t] }))
    return [...known, ...unknown]
  }, [filteredSchedules])

  // 전체 합계
  const totalHours = useMemo(() => {
    return filteredSchedules.reduce((acc, s) => {
      acc.count += 1
      acc.minutes += diffMinutes(s.start_time, s.end_time)
      return acc
    }, { count: 0, minutes: 0 })
  }, [filteredSchedules])

  // 선생님별 시수 (유형별 세분화 + 합계)
  const teacherHours = useMemo(() => {
    const map: Record<string, { name: string; total: { count: number; minutes: number }; byType: Record<string, { count: number; minutes: number }> }> = {}
    filteredSchedules.forEach(s => {
      const key = s.teacher_id || 'unassigned'
      const name = s.teacher?.name || '미배정'
      if (!map[key]) map[key] = { name, total: { count: 0, minutes: 0 }, byType: {} }
      const mins = diffMinutes(s.start_time, s.end_time)
      const t = s.schedule_type || 'etc'
      map[key].total.count += 1
      map[key].total.minutes += mins
      if (!map[key].byType[t]) map[key].byType[t] = { count: 0, minutes: 0 }
      map[key].byType[t].count += 1
      map[key].byType[t].minutes += mins
    })
    return Object.values(map).sort((a, b) => {
      // 미배정은 항상 마지막
      if (a.name === '미배정') return 1
      if (b.name === '미배정') return -1
      return b.total.minutes - a.total.minutes
    })
  }, [filteredSchedules])

  if (loading) return <div className={styles.loading}>오케스트라 데이터를 분석 중입니다...</div>

  return (
    <div className={styles.container}>
      {/* [추가됨] 기수 필터와 제목 나란히 배치 */}
      <div className={styles.headerRow}>
        <h1 className={styles.title}>전체 통계 대시보드</h1>
        {activeTab === 'hours' ? (
          <select
            className={styles.filterSelect}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="all">전체 기간</option>
            {availableMonths.map(m => {
              const [y, mo] = m.split('-')
              return <option key={m} value={m}>{y}년 {Number(mo)}월</option>
            })}
          </select>
        ) : (
          <select
            className={styles.filterSelect}
            value={selectedCohort}
            onChange={(e) => setSelectedCohort(e.target.value)}
          >
            <option value="all">전체 기수 보기</option>
            <option value="1">1기 통계만</option>
            <option value="2">2기 통계만</option>
            <option value="3">3기 통계만</option>
            <option value="4">4기 통계만</option>
          </select>
        )}
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>총 단원 (학생) 수</div>
          <div className={styles.cardValue}>{stats.totalStudents}명</div>
          {stats.unassignedStudents > 0 && (
            <div className={styles.cardSub}>⚠️ 미배정 학생: {stats.unassignedStudents}명</div>
          )}
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>활동 선생님 수</div>
          <div className={styles.cardValue}>{stats.totalTeachers}명</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>평균 수업 점수</div>
          <div className={styles.cardValue}>{stats.avgScore}점</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>누적 평가 건수</div>
          <div className={styles.cardValue}>{stats.totalEvaluations}건</div>
        </div>
      </div>

      <div className={styles.tabContainer}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'personnel' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('personnel')}
        >
          👥 반별 현황
        </button>
        {/* [추가됨] 악기 파트별 통계 탭 */}
        <button 
          className={`${styles.tabBtn} ${activeTab === 'instruments' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('instruments')}
        >
          🎻 악기 파트별 현황
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'evaluations' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('evaluations')}
        >
          📈 최근 수업 피드
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'hours' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('hours')}
        >
          🕐 시수 현황
        </button>
      </div>

      <div className={styles.detailSection}>
        {activeTab === 'personnel' && (
          <div>
            <h2 className={styles.detailTitle}>반별 학생 분포 현황</h2>
            {classStats.length === 0 ? (
              <div className={styles.empty}>해당 기수에 배정된 반 데이터가 없습니다.</div>
            ) : (
              classStats.map((cls, idx) => (
                <div key={idx} className={styles.listItem}>
                  <span className={styles.listLabel}>{cls.name}</span>
                  <span className={styles.listValue}>{cls.count}명</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* [추가됨] 악기별 리스트 렌더링 */}
        {activeTab === 'instruments' && (
          <div>
            <h2 className={styles.detailTitle}>악기 파트별 학생 수</h2>
            {instrumentStats.length === 0 ? (
              <div className={styles.empty}>해당 기수에 등록된 악기 데이터가 없습니다.</div>
            ) : (
              instrumentStats.map((inst, idx) => (
                <div key={idx} className={styles.listItem}>
                  <span className={styles.listLabel}>{inst.name}</span>
                  <span className={styles.listValue}>{inst.count}명</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'evaluations' && (
          <div>
            <h2 className={styles.detailTitle}>최근 등록된 특이사항 (최신 5건)</h2>
            {recentEvaluations.length === 0 ? (
              <div className={styles.empty}>해당 기수의 평가 내역이 없습니다.</div>
            ) : (
              recentEvaluations.map((ev, idx) => (
                <div key={idx} className={styles.listItem} style={{ flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '14px', color: '#718096' }}>
                    <strong>{ev.student?.name || '알 수 없음'} {ev.student?.cohort ? `(${ev.student.cohort}기)` : ''}</strong>
                    <span>{ev.score}점</span>
                    <span>작성자: {ev.writer?.name || '알 수 없음'}</span>
                    <span>{new Date(ev.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ color: '#2d3748', lineHeight: '1.5' }}>{ev.comment}</div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'hours' && (
          <div>
            {rawData.schedules.length === 0 ? (
              <div className={styles.empty}>등록된 일정이 없습니다.</div>
            ) : (
              <>
                {/* 유형별 시수 요약 카드 */}
                <h2 className={styles.detailTitle}>유형별 시수 {selectedMonth !== 'all' && `(${selectedMonth.split('-')[0]}년 ${Number(selectedMonth.split('-')[1])}월)`}</h2>
                <div className={styles.hoursCardGrid}>
                  <div className={`${styles.hoursCard} ${styles.hoursCardTotal}`}>
                    <div className={styles.hoursCardLabel}>🎼 전체 합계</div>
                    <div className={styles.hoursCardValue}>{formatDuration(totalHours.minutes)}</div>
                    <div className={styles.hoursCardCount}>총 {totalHours.count}회</div>
                  </div>
                  {typeHours.map(t => {
                    const cfg = SCHEDULE_TYPE_CONFIG[t.type] ?? { label: t.type, icon: '📌' }
                    return (
                      <div key={t.type} className={styles.hoursCard}>
                        <div className={styles.hoursCardLabel}>{cfg.icon} {cfg.label}</div>
                        <div className={styles.hoursCardValue}>{formatDuration(t.minutes)}</div>
                        <div className={styles.hoursCardCount}>{t.count}회</div>
                      </div>
                    )
                  })}
                </div>

                {/* 선생님별 시수 표 */}
                <h2 className={styles.detailTitle} style={{ marginTop: '32px' }}>선생님별 시수</h2>
                {teacherHours.length === 0 ? (
                  <div className={styles.empty}>해당 기간에 집계할 시수가 없습니다.</div>
                ) : (
                  <div className={styles.hoursTableWrap}>
                    <table className={styles.hoursTable}>
                      <thead>
                        <tr>
                          <th>선생님</th>
                          {typeHours.map(t => {
                            const cfg = SCHEDULE_TYPE_CONFIG[t.type] ?? { label: t.type, icon: '📌' }
                            return <th key={t.type}>{cfg.icon} {cfg.label}</th>
                          })}
                          <th className={styles.hoursTotalCol}>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacherHours.map((th, idx) => (
                          <tr key={idx} className={th.name === '미배정' ? styles.hoursUnassignedRow : ''}>
                            <td className={styles.hoursTeacherName}>{th.name === '미배정' ? th.name : `${th.name} 선생님`}</td>
                            {typeHours.map(t => {
                              const cell = th.byType[t.type]
                              return (
                                <td key={t.type}>
                                  {cell
                                    ? <><span className={styles.hoursCellTime}>{formatDuration(cell.minutes)}</span><span className={styles.hoursCellCount}>{cell.count}회</span></>
                                    : <span className={styles.hoursCellEmpty}>-</span>}
                                </td>
                              )
                            })}
                            <td className={styles.hoursTotalCol}>
                              <span className={styles.hoursCellTime}>{formatDuration(th.total.minutes)}</span>
                              <span className={styles.hoursCellCount}>{th.total.count}회</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}