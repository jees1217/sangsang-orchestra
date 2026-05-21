'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './schedules-manage.module.css'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function ScheduleManagementPage() {
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  
  // 데이터 목록
  const [schedules, setSchedules] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [availabilities, setAvailabilities] = useState<any[]>([])
  const [allClasses, setAllClasses] = useState<any[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])

  // 폼 상태
  const [title, setTitle] = useState('')
  const [scheduleType, setScheduleType] = useState('online')
  const [scheduleDate, setScheduleDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [teacherId, setTeacherId] = useState('')
  const [location, setLocation] = useState('')
  
  // 타겟팅 상태
  const [targetType, setTargetType] = useState<'all' | 'cohort' | 'class' | 'individual'>('all')
  const [targetCohort, setTargetCohort] = useState('4')
  const [filterCohort, setFilterCohort] = useState('4') 
  const [targetClassId, setTargetClassId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUser(user)

      // 1. 기초 데이터 로드 (선생님, 반, 학생)
      const { data: tData } = await supabase.from('users').select('id, name').in('role', ['teacher', 'director'])
      const { data: cData } = await supabase.from('classes').select('id, name, cohort')
      const { data: sData } = await supabase.from('users').select('id, name, cohort').eq('role', 'student').order('name')
      
      setTeachers(tData || [])
      setAllClasses(cData || [])
      setAllStudents(sData || [])

      // 2. 선생님 가용 시간 데이터 로드
      const { data: availData } = await supabase
        .from('teacher_availabilities')
        .select('*, teacher:teacher_id(name)')
        .order('day_of_week')
        .order('start_time')
      setAvailabilities(availData || [])

      fetchSchedules()
    } catch (error) {
      console.error('로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedules = async () => {
    const { data } = await supabase
      .from('schedules')
      .select('*, teacher:teacher_id(name), target_class:target_class_id(name, cohort), target_user:target_user_id(name, cohort)')
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
    setSchedules(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (startTime >= endTime) return alert('종료 시간은 시작 시간보다 늦어야 합니다.')

    setIsSubmitting(true)
    const payload: any = {
      title, schedule_type: scheduleType, schedule_date: scheduleDate,
      start_time: `${startTime}:00`, end_time: `${endTime}:00`,
      teacher_id: teacherId || null, location,
      target_type: targetType, created_by: currentUser.id
    }

    if (targetType === 'cohort') payload.target_cohort = Number(targetCohort)
    if (targetType === 'class') {
      if (!targetClassId) { setIsSubmitting(false); return alert('반을 선택해주세요.'); }
      payload.target_class_id = targetClassId
    }
    if (targetType === 'individual') {
      if (!targetUserId) { setIsSubmitting(false); return alert('학생을 선택해주세요.'); }
      payload.target_user_id = targetUserId
    }

    try {
      const { error } = await supabase.from('schedules').insert(payload)
      if (error) throw error

      alert('일정이 성공적으로 등록되었습니다.')
      setTitle(''); setLocation(''); // 폼 초기화
      fetchSchedules()
    } catch (error) {
      console.error('등록 실패:', error)
      alert('일정 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 일정을 취소/삭제하시겠습니까?')) return
    await supabase.from('schedules').delete().eq('id', id)
    fetchSchedules()
  }

  // UI 헬퍼 함수들
  const getScheduleTypeBadge = (type: string) => {
    switch (type) {
      case 'online': return <span className={`${styles.badge} ${styles.bgMint}`}>💻 온라인 수업</span>
      case 'offline': return <span className={`${styles.badge} ${styles.bgBlue}`}>🎻 오프라인 합주</span>
      case 'special_lecture': return <span className={`${styles.badge} ${styles.bgPurple}`}>🎓 명사 특강</span>
      case 'camp': return <span className={`${styles.badge} ${styles.bgOrange}`}>🏕️ 음악 캠프</span>
      // [변경됨] 정기 공연 -> 연주회
      case 'performance': return <span className={`${styles.badge} ${styles.bgPurple}`}>🎉 연주회</span>
      case 'rehearsal': return <span className={`${styles.badge} ${styles.bgGray}`}>🔄 리허설</span>
      case 'ot': return <span className={`${styles.badge} ${styles.bgGray}`}>👋 오리엔테이션</span>
      default: return null
    }
  }

  const getTargetLabel = (sc: any) => {
    switch (sc.target_type) {
      case 'all': return '전체 단원'
      case 'cohort': return `${sc.target_cohort}기 전용`
      case 'class': return `[${sc.target_class?.cohort}기] ${sc.target_class?.name}`
      case 'individual': return `[개별] ${sc.target_user?.name}`
      default: return '-'
    }
  }

  if (loading) return <div className={styles.container}>데이터를 불러오는 중입니다...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>📅 통합 일정 관리 (마스터)</h1>
      
      <div className={styles.layout}>
        {/* 왼쪽: 일정 생성 폼 & 선생님 가용시간 참조 */}
        <div className={styles.leftPanel}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>새로운 일정 등록</h2>
            <form onSubmit={handleSubmit}>
              
              <div className={styles.formGroup}>
                <label className={styles.label}>일정 유형</label>
                <select className={styles.select} value={scheduleType} onChange={e => setScheduleType(e.target.value)}>
                  <option value="online">💻 주중 온라인 수업</option>
                  <option value="offline">🎻 주말 오프라인 합주</option>
                  <option value="special_lecture">🎓 명사 특강</option>
                  <option value="camp">🏕️ 음악 캠프</option>
                  {/* [변경됨] 정기 공연 -> 연주회 */}
                  <option value="performance">🎉 연주회</option>
                  <option value="rehearsal">🔄 리허설</option>
                  <option value="ot">👋 오리엔테이션</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>일정 제목</label>
                <input type="text" className={styles.input} required placeholder="예: 4기 첼로 심화반 온라인 수업" value={title} onChange={e => setTitle(e.target.value)} />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>날짜 및 시간</label>
                <input type="date" className={styles.input} required value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ marginBottom: 8 }} />
                <div className={styles.row}>
                  <input type="time" className={styles.input} required value={startTime} onChange={e => setStartTime(e.target.value)} />
                  <span style={{ alignSelf: 'center' }}>~</span>
                  <input type="time" className={styles.input} required value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>담당 선생님 (선택)</label>
                <select className={styles.select} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                  <option value="">담당자 없음 (전체 행사 등)</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name} 선생님</option>)}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>참여 대상 (타겟팅)</label>
                <select className={styles.select} value={targetType} onChange={(e) => { setTargetType(e.target.value as any); setTargetClassId(''); setTargetUserId(''); }} style={{ marginBottom: 8 }}>
                  <option value="all">전체 (모든 단원)</option>
                  <option value="cohort">기수별 단체</option>
                  <option value="class">반별 선택</option>
                  <option value="individual">개별 학생</option>
                </select>

                {targetType === 'cohort' && (
                  <select className={styles.select} value={targetCohort} onChange={(e) => setTargetCohort(e.target.value)}>
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n}기 전체</option>)}
                  </select>
                )}
                {targetType === 'class' && (
                  <div className={styles.row}>
                    <select className={styles.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}>
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}기</option>)}
                    </select>
                    <select className={styles.select} value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)}>
                      <option value="">반 선택</option>
                      {allClasses.filter(c => c.cohort === Number(filterCohort)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {targetType === 'individual' && (
                  <div className={styles.row}>
                    <select className={styles.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}>
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}기</option>)}
                    </select>
                    <select className={styles.select} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                      <option value="">학생 선택</option>
                      {allStudents.filter(s => s.cohort === Number(filterCohort)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>장소 또는 화상회의(Zoom) 링크</label>
                <input type="text" className={styles.input} placeholder="예: 예술의 전당 / Zoom 링크" value={location} onChange={e => setLocation(e.target.value)} />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? '등록 중...' : '일정 확정 및 캘린더 등록'}
              </button>
            </form>
          </div>

          {/* 선생님 출강 가능 시간 참고표 */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle} style={{ fontSize: '15px' }}>📌 선생님 가용 시간 참조</h2>
            <div className={styles.availBox}>
              {availabilities.length === 0 ? <div style={{color: '#94a3b8'}}>제출된 데이터가 없습니다.</div> : 
                availabilities.map(av => (
                  <div key={av.id} className={styles.availItem}>
                    <span style={{ fontWeight: 600 }}>{av.teacher?.name}</span>
                    <span>{DAYS[av.day_of_week]}요일 {av.start_time.substring(0,5)}~{av.end_time.substring(0,5)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* 오른쪽: 등록된 전체 일정 리스트 */}
        <div className={styles.rightPanel}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>오케스트라 확정 일정 ({schedules.length}건)</h2>
            {schedules.length === 0 ? (
              <div className={styles.empty}>등록된 일정이 없습니다.</div>
            ) : (
              schedules.map(sc => (
                <div key={sc.id} className={styles.scheduleCard}>
                  <div className={styles.scHeader}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {getScheduleTypeBadge(sc.schedule_type)}
                      <span className={styles.scTitle}>{sc.title}</span>
                      <span className={styles.targetBadge}>참여: {getTargetLabel(sc)}</span>
                    </div>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(sc.id)}>삭제</button>
                  </div>
                  
                  <div className={styles.scMeta}>
                    <span style={{ color: '#00A99D', fontWeight: 'bold' }}>
                      🗓️ {new Date(sc.schedule_date).toLocaleDateString('ko-KR', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <span>⏰ {sc.start_time.substring(0,5)} ~ {sc.end_time.substring(0,5)}</span>
                    {sc.teacher && <span>👨‍🏫 {sc.teacher.name} senescence</span>}
                  </div>
                  
                  {sc.location && (
                    <div className={styles.scLocation}>
                      📍 장소/링크: {sc.location.startsWith('http') ? <a href={sc.location} target="_blank" rel="noreferrer" style={{color: '#3182ce', textDecoration: 'underline'}}>{sc.location}</a> : sc.location}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}