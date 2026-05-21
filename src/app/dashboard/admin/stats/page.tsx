'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './stats.module.css'

export default function AdminStatsPage() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'personnel' | 'instruments' | 'evaluations'>('personnel')
  const [selectedCohort, setSelectedCohort] = useState<string>('all') // 기수 필터 상태 ('all' 또는 '1', '2' 등)
  
  // DB에서 긁어온 원본 데이터 (필터링 전)
  const [rawData, setRawData] = useState<{ users: any[], evals: any[], classes: any[] }>({ users: [], evals: [], classes: [] })

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
      const { data: users } = await supabase.from('users').select('id, role, class_id, cohort, instrument')
      
      // 평가 데이터 (어떤 학생의 평가인지 cohort까지 가져옴)
      const { data: evaluations } = await supabase
        .from('evaluations')
        .select('id, score, comment, created_at, student:student_id(name, cohort), writer:writer_id(name)')
        .order('created_at', { ascending: false })

      // 반 데이터
      const { data: classes } = await supabase.from('classes').select('id, name')

      setRawData({ 
        users: users || [], 
        evals: evaluations || [], 
        classes: classes || [] 
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

  if (loading) return <div className={styles.loading}>오케스트라 데이터를 분석 중입니다...</div>

  return (
    <div className={styles.container}>
      {/* [추가됨] 기수 필터와 제목 나란히 배치 */}
      <div className={styles.headerRow}>
        <h1 className={styles.title}>전체 통계 대시보드</h1>
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
                    <span>⭐ {ev.score}점</span>
                    <span>작성자: {ev.writer?.name || '알 수 없음'}</span>
                    <span>{new Date(ev.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ color: '#2d3748', lineHeight: '1.5' }}>{ev.comment}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}