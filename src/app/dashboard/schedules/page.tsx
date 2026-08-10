'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CLASS_TEACHER_ROLES } from '@/lib/roles'
import styles from './schedules-manage.module.css'

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const TYPE_CONFIG: Record<string, { label: string; icon: string; colorClass: string }> = {
  online:          { label: '온라인 클래스',   icon: '💻', colorClass: 'typeMint'   },
  offline:         { label: '오프라인 합주',  icon: '🎻', colorClass: 'typeBlue'   },
  special_lecture: { label: '명사 특강',      icon: '🎓', colorClass: 'typePurple' },
  camp:            { label: '음악 캠프',      icon: '🏕️', colorClass: 'typeOrange' },
  performance:     { label: '연주회',         icon: '🎉', colorClass: 'typePurple' },
  rehearsal:       { label: '리허설',         icon: '🔄', colorClass: 'typeGray'   },
  ot:              { label: '오리엔테이션',   icon: '👋', colorClass: 'typeGray'   },
}

export default function ScheduleManagementPage() {
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userRole, setUserRole] = useState('')

  const [schedules, setSchedules] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [allClasses, setAllClasses] = useState<any[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  // 교육차수(예: 2027.06~2028.05) — 학생 단위 기수(cohort)와는 별개의, 연 단위 프로그램 주기.
  // 관리자 전용 필터라서 director에게는 목록만 받아 두고 UI를 노출하지 않는다.
  const [terms, setTerms] = useState<{ term: number; started_at: string | null; closed_at: string | null }[]>([])

  // 폼 상태
  const [title, setTitle] = useState('')
  const [scheduleType, setScheduleType] = useState('online')
  const [scheduleDate, setScheduleDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [teacherId, setTeacherId] = useState('')
  const [location, setLocation] = useState('')
  const [targetType, setTargetType] = useState<'all' | 'cohort' | 'class' | 'individual'>('all')
  const [targetCohorts, setTargetCohorts] = useState<number[]>([4])
  const [filterCohort, setFilterCohort] = useState('4')
  const [targetClassId, setTargetClassId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTitleManual, setIsTitleManual] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // 등록 폼은 "새로운 일정 등록" 버튼을 눌렀을 때만 노출 — 기본 화면은 캘린더·목록이 전체 폭
  const [showForm, setShowForm] = useState(false)

  // 캘린더 상태
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth()) // 0-based
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'time' | 'title'>('time')
  // 지난 일정은 기본으로 접어둔다 (날짜를 콕 집어 선택했을 땐 과거든 미래든 그대로 보여준다)
  const [showPast, setShowPast] = useState(false)

  // 목록·캘린더 공통 조회 필터 (폼의 filterCohort와는 별개 — 이쪽은 "무엇을 볼지")
  const [viewCohort, setViewCohort] = useState<string>('')
  const [viewClassId, setViewClassId] = useState<string>('')
  const [viewTeacherId, setViewTeacherId] = useState<string>('')
  const [viewTerm, setViewTerm] = useState<string>('')

  const supabase = createClient()

  useEffect(() => { fetchInitialData() }, [])

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUser(user)

      const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
      setUserRole(me?.role || '')

      const [{ data: tData }, { data: cData }, { data: sData }, { data: termData }] = await Promise.all([
        supabase.from('users').select('id, name').in('role', [...CLASS_TEACHER_ROLES]).order('name'),
        supabase.from('classes').select('id, name, cohort, teacher_ids'),
        supabase.from('users').select('id, name, cohort').eq('role', 'student').order('name'),
        supabase.from('attendance_terms').select('term, started_at, closed_at').order('term', { ascending: false }),
      ])

      setTeachers(tData || [])
      setAllClasses(cData || [])
      setAllStudents(sData || [])
      setTerms(termData || [])
      await fetchSchedules()
    } catch (error) {
      console.error('로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from('schedules')
      .select('*, teacher:teacher_id(name), target_class:target_class_id(name, cohort), target_user:target_user_id(name, cohort)')
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (error) {
      console.error('일정 조회 실패:', error)
      setFetchError(`데이터 로드 실패: ${error.message} (code: ${error.code})`)
      setSchedules([])
      return
    }
    setFetchError(null)
    setSchedules(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (startTime >= endTime) return alert('종료 시간은 시작 시간보다 늦어야 합니다.')
    setIsSubmitting(true)

    const payload: any = {
      title: effectiveTitle, schedule_type: scheduleType, schedule_date: scheduleDate,
      start_time: `${startTime}:00`, end_time: `${endTime}:00`,
      teacher_id: teacherId || null, location,
      target_type: targetType, created_by: currentUser.id,
    }
    if (targetType === 'cohort') {
      if (targetCohorts.length === 0) { setIsSubmitting(false); return alert('기수를 1개 이상 선택해주세요.') }
      payload.target_cohort = targetCohorts
    }
    if (targetType === 'class') {
      if (!targetClassId) { setIsSubmitting(false); return alert('반을 선택해주세요.') }
      payload.target_class_id = targetClassId
    }
    if (targetType === 'individual') {
      if (!targetUserId) { setIsSubmitting(false); return alert('학생을 선택해주세요.') }
      payload.target_user_id = targetUserId
    }

    try {
      if (editingId) {
        const { error } = await supabase.from('schedules').update(payload).eq('id', editingId)
        if (error) throw error
        alert('일정이 수정되었습니다.')
        setEditingId(null)
      } else {
        const { error } = await supabase.from('schedules').insert(payload)
        if (error) throw error
        alert('일정이 성공적으로 등록되었습니다.')
      }
      setTitle(''); setIsTitleManual(false); setLocation('')
      setShowForm(false)
      await fetchSchedules()
      const [y, m] = scheduleDate.split('-').map(Number)
      setCalYear(y); setCalMonth(m - 1)
      setSelectedDate(scheduleDate)
    } catch (error) {
      console.error(editingId ? '수정 실패:' : '등록 실패:', error)
      alert(editingId ? '일정 수정 중 오류가 발생했습니다.' : '일정 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (sc: any) => {
    setEditingId(sc.id)
    setScheduleType(sc.schedule_type)
    setScheduleDate(sc.schedule_date.substring(0, 10))
    setStartTime(sc.start_time.substring(0, 5))
    setEndTime(sc.end_time.substring(0, 5))
    setTeacherId(sc.teacher_id || '')
    setLocation(sc.location || '')
    setTargetType(sc.target_type)
    if (sc.target_type === 'cohort') setTargetCohorts(sc.target_cohort || [])
    if (sc.target_type === 'class') setTargetClassId(sc.target_class_id || '')
    if (sc.target_type === 'individual') setTargetUserId(sc.target_user_id || '')
    setIsTitleManual(true)
    setTitle(sc.title)
    // 수정은 폼에서 이뤄지므로 접혀 있으면 함께 펼친다
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setTitle(''); setIsTitleManual(false); setLocation('')
    setScheduleType('online'); setScheduleDate(''); setStartTime('10:00'); setEndTime('12:00')
    setTeacherId(''); setTargetType('all'); setTargetCohorts([4]); setTargetClassId(''); setTargetUserId('')
  }

  // 폼 안의 "취소" 버튼: 편집 상태를 비우고 폼도 닫는다
  const handleCloseForm = () => { handleCancelEdit(); setShowForm(false) }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 일정을 취소/삭제하시겠습니까?')) return
    await supabase.from('schedules').delete().eq('id', id)
    setSelectedDate(null)
    await fetchSchedules()
  }

  // schedule_date(date)를 교육차수의 started_at/closed_at(timestamptz) 구간과 비교한다.
  // 시각까지 볼 필요는 없으니 날짜 부분만 잘라서 비교 — 경계가 null이면 그쪽은 열려 있다.
  const isInTerm = (sc: any, t: { started_at: string | null; closed_at: string | null }) => {
    const d = sc.schedule_date.substring(0, 10)
    if (t.started_at && d < t.started_at.substring(0, 10)) return false
    if (t.closed_at && d > t.closed_at.substring(0, 10)) return false
    return true
  }

  // 기수/반/선생님/교육차수 필터. 캘린더와 목록이 같은 결과를 보도록 한 번만 걸러 둔다.
  // 전체 단원(all) 대상 일정은 해당 기수도 실제로 참여하므로 기수 필터에 함께 포함한다.
  const filteredSchedules = useMemo(() => {
    const cohortNum = viewCohort ? Number(viewCohort) : null
    const termRow = viewTerm ? terms.find(t => t.term === Number(viewTerm)) : null
    return schedules.filter(sc => {
      if (cohortNum !== null) {
        const hit =
          sc.target_type === 'all' ||
          (sc.target_type === 'cohort' && (sc.target_cohort || []).includes(cohortNum)) ||
          (sc.target_type === 'class' && sc.target_class?.cohort === cohortNum) ||
          (sc.target_type === 'individual' && sc.target_user?.cohort === cohortNum)
        if (!hit) return false
      }
      if (viewClassId && sc.target_class_id !== viewClassId) return false
      if (viewTeacherId && sc.teacher_id !== viewTeacherId) return false
      if (termRow && !isInTerm(sc, termRow)) return false
      return true
    })
  }, [schedules, viewCohort, viewClassId, viewTeacherId, viewTerm, terms])

  const hasActiveFilter = !!(viewCohort || viewClassId || viewTeacherId || viewTerm)
  const resetFilters = () => { setViewCohort(''); setViewClassId(''); setViewTeacherId(''); setViewTerm('') }

  // 교육차수 셀렉트 라벨: "5차 (2027.06 ~ 2028.05)" / 마감 전이면 "진행중"
  const termOptionLabel = (t: { term: number; started_at: string | null; closed_at: string | null }) => {
    const fmt = (v: string) => v.slice(0, 7).replace('-', '.')
    if (!t.started_at && !t.closed_at) return `${t.term}차`
    const from = t.started_at ? fmt(t.started_at) : '~'
    const to = t.closed_at ? fmt(t.closed_at) : '진행중'
    return `${t.term}차 (${from} ~ ${to})`
  }

  // 날짜별 일정 맵 (캘린더 렌더링용)
  const scheduleMap = useMemo(() => {
    const map: Record<string, any[]> = {}
    filteredSchedules.forEach(sc => {
      // schedule_date가 '2025-06-01' 또는 '2025-06-01T...' 모두 대응
      const dateKey = sc.schedule_date.substring(0, 10)
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(sc)
    })
    return map
  }, [filteredSchedules])

  // 선택된 날짜의 일정
  const selectedSchedules = selectedDate ? (scheduleMap[selectedDate] || []) : []

  // 정렬 기준 적용 (시간순: 날짜/시간 오름차순, 이름순: 제목 가나다순)
  const applySort = (list: any[]) =>
    sortBy === 'title' ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'ko')) : list

  const sortedSelectedSchedules = useMemo(
    () => applySort(selectedSchedules),
    [selectedSchedules, sortBy]
  )

  // 타임존 문제 방지를 위해 로컬 날짜 문자열(YYYY-MM-DD)로 비교한다.
  const todayStr = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])
  const isPastSchedule = (sc: any) => sc.schedule_date.substring(0, 10) < todayStr

  // 날짜 미선택(전체 목록) 상태에서만 예정/지난 일정을 나눈다.
  // filteredSchedules가 이미 날짜 오름차순이므로 지난 쪽은 뒤집기만 하면 최신순이 된다.
  const { upcomingSchedules, pastSchedules } = useMemo(() => {
    const upcoming = filteredSchedules.filter(sc => !isPastSchedule(sc))
    const past = filteredSchedules.filter(isPastSchedule).slice().reverse()
    return { upcomingSchedules: applySort(upcoming), pastSchedules: applySort(past) }
  }, [filteredSchedules, sortBy, todayStr])

  // 이번 달 캘린더 날짜 계산
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay() // 0=일
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [calYear, calMonth])

  const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) } else setCalMonth(m => m - 1) }
  const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) } else setCalMonth(m => m + 1) }

  const autoTitle = useMemo(() => {
    const typeName = TYPE_CONFIG[scheduleType]?.label || scheduleType
    switch (targetType) {
      case 'all': return `전체 단원 ${typeName}`
      case 'cohort': return targetCohorts.length > 0 ? `${[...targetCohorts].sort((a, b) => a - b).join(',')}기 전체 ${typeName}` : ''
      case 'class': {
        const cls = allClasses.find(c => c.id === targetClassId)
        return cls ? `${cls.cohort}기 ${cls.name} ${typeName}` : ''
      }
      case 'individual': {
        const student = allStudents.find(s => s.id === targetUserId)
        return student ? `${student.name} ${typeName}` : ''
      }
      default: return ''
    }
  }, [targetType, targetCohorts, targetClassId, targetUserId, scheduleType, allClasses, allStudents])

  const effectiveTitle = isTitleManual ? title : autoTitle

  useEffect(() => {
    if (targetType === 'class' && targetClassId) {
      const cls = allClasses.find(c => c.id === targetClassId)
      const ids = cls?.teacher_ids || []
      setTeacherId(ids[0] || '')
    } else if (targetType !== 'class') {
      setTeacherId('')
    }
  }, [targetType, targetClassId, allClasses])

  const toDateKey = (day: number) => `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const todayKey = new Date().toISOString().substring(0, 10)

  const getTargetLabel = (sc: any) => {
    switch (sc.target_type) {
      case 'all': return '전체 단원'
      case 'cohort': return `${[...(sc.target_cohort || [])].sort((a: number, b: number) => a - b).join(',')}기 전용`
      case 'class': return `[${sc.target_class?.cohort}기] ${sc.target_class?.name}`
      case 'individual': return `[개별] ${sc.target_user?.name}`
      default: return '-'
    }
  }

  const TypeBadge = ({ type }: { type: string }) => {
    const cfg = TYPE_CONFIG[type] ?? { label: type, icon: '📌', colorClass: 'typeGray' }
    return <span className={`${styles.badge} ${styles[cfg.colorClass]}`}>{cfg.icon} {cfg.label}</span>
  }

  const renderScheduleCard = (sc: any, past = false) => (
    <div key={sc.id} className={`${styles.scheduleCard} ${past ? styles.scheduleCardPast : ''}`}>
      <div className={styles.scHeader}>
        <div className={styles.scHeaderLeft}>
          <TypeBadge type={sc.schedule_type} />
          <span className={styles.targetBadge}>👥 {getTargetLabel(sc)}</span>
        </div>
        {isAdmin && (
          <div className={styles.cardActions}>
            <button className={styles.editBtn} onClick={() => handleEdit(sc)}>수정</button>
            <button className={styles.deleteBtn} onClick={() => handleDelete(sc.id)}>삭제</button>
          </div>
        )}
      </div>
      <div className={styles.scTitle}>{sc.title}</div>
      <div className={styles.scMeta}>
        <span>🗓️ {sc.schedule_date.substring(0, 10)}</span>
        <span>⏰ {sc.start_time.substring(0,5)} ~ {sc.end_time.substring(0,5)}</span>
        {sc.teacher && <span>👨‍🏫 {sc.teacher.name} 선생님</span>}
      </div>
      {sc.location && (
        <div className={styles.scLocation}>
          📍 {sc.location.startsWith('http')
            ? <a href={sc.location} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>{sc.location}</a>
            : sc.location}
        </div>
      )}
    </div>
  )

  if (loading) return (
    <div className={styles.container}>
      <div className={styles.loadingBox}>데이터를 불러오는 중입니다...</div>
    </div>
  )

  // 관리자만 일정 등록/수정/삭제 가능. 옵저버(director)는 캘린더·목록 열람만.
  const isAdmin = userRole === 'admin'

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>📅 통합 일정{isAdmin ? ' 관리' : ''}</h1>
        {isAdmin && (
          <button
            type="button"
            className={`${styles.newBtn} ${showForm ? styles.newBtnActive : ''}`}
            onClick={() => (showForm ? handleCloseForm() : setShowForm(true))}
          >
            {showForm ? '✕ 작성 닫기' : '✏️ 새로운 일정 등록'}
          </button>
        )}
      </div>

      {fetchError && (
        <div style={{
          background: '#FFF5F5', border: '1px solid #FC8181', borderRadius: '12px',
          padding: '14px 18px', marginBottom: '20px', color: '#C53030', fontSize: '14px', fontWeight: 600
        }}>
          ⚠️ {fetchError}
          <div style={{ fontSize: '12px', fontWeight: 400, marginTop: '4px', color: '#E53E3E' }}>
            Supabase 대시보드에서 schedules 테이블의 RLS 정책을 확인하거나, 아래 SQL을 실행하세요.
          </div>
        </div>
      )}

      <div className={styles.layout}>
        {/* ──────── 왼쪽: 폼 (관리자 전용 · 버튼을 눌렀을 때만) ──────── */}
        {isAdmin && showForm && (
        <div className={styles.leftPanel}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              {editingId ? '✏️ 일정 수정' : '새로운 일정 등록'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.label}>일정 유형</label>
                <select className={styles.select} value={scheduleType} onChange={e => setScheduleType(e.target.value)}>
                  <option value="online">💻 온라인 클래스</option>
                  <option value="offline">🎻 오프라인 합주</option>
                  <option value="special_lecture">🎓 명사 특강</option>
                  <option value="camp">🏕️ 음악 캠프</option>
                  <option value="performance">🎉 연주회</option>
                  <option value="rehearsal">🔄 리허설</option>
                  <option value="ot">👋 오리엔테이션</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>참여 대상</label>
                <select className={styles.select} value={targetType}
                  onChange={e => { setTargetType(e.target.value as any); setTargetClassId(''); setTargetUserId('') }}
                  style={{ marginBottom: 8 }}>
                  <option value="all">전체 (모든 단원)</option>
                  <option value="cohort">기수별 단체</option>
                  <option value="class">반별 선택</option>
                  <option value="individual">개별 학생</option>
                </select>
                {targetType === 'cohort' && (
                  <div className={styles.row} style={{ flexWrap: 'wrap', gap: '10px' }}>
                    {[1,2,3,4].map(n => (
                      <label key={n} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={targetCohorts.includes(n)}
                          onChange={e => {
                            setTargetCohorts(prev =>
                              e.target.checked ? [...prev, n] : prev.filter(c => c !== n)
                            )
                          }}
                        />
                        {n}기
                      </label>
                    ))}
                  </div>
                )}
                {targetType === 'class' && (
                  <div className={styles.row}>
                    <select className={styles.select} value={filterCohort} onChange={e => setFilterCohort(e.target.value)}>
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}기</option>)}
                    </select>
                    <select className={styles.select} value={targetClassId} onChange={e => setTargetClassId(e.target.value)}>
                      <option value="">반 선택</option>
                      {allClasses.filter(c => c.cohort === Number(filterCohort)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {targetType === 'individual' && (
                  <div className={styles.row}>
                    <select className={styles.select} value={filterCohort} onChange={e => setFilterCohort(e.target.value)}>
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n}기</option>)}
                    </select>
                    <select className={styles.select} value={targetUserId} onChange={e => setTargetUserId(e.target.value)}>
                      <option value="">학생 선택</option>
                      {allStudents.filter(s => s.cohort === Number(filterCohort)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {targetType !== 'class' && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>담당 선생님 (선택)</label>
                  <select className={styles.select} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                    <option value="">담당자 없음</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name} 선생님</option>)}
                  </select>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.label}>일정 제목</label>
                <input
                  type="text"
                  className={styles.input}
                  required
                  placeholder="참여 대상과 일정 유형을 선택하면 자동 완성됩니다"
                  value={effectiveTitle}
                  onChange={e => {
                    const val = e.target.value
                    if (val === '' || val === autoTitle) {
                      setIsTitleManual(false)
                      setTitle('')
                    } else {
                      setIsTitleManual(true)
                      setTitle(val)
                    }
                  }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>날짜 및 시간</label>
                <input type="date" className={styles.input} required value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ marginBottom: 8 }} />
                <div className={styles.row}>
                  <input type="time" className={styles.input} required value={startTime} onChange={e => setStartTime(e.target.value)} />
                  <span className={styles.timeSep}>~</span>
                  <input type="time" className={styles.input} required value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>장소 또는 온라인 링크</label>
                <input type="text" className={styles.input} placeholder="예: 코너스톤 / 구글밋" value={location} onChange={e => setLocation(e.target.value)} />
              </div>

              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? (editingId ? '수정 중...' : '등록 중...') : editingId ? '✅ 수정 완료' : '✅ 일정 확정 및 캘린더 등록'}
              </button>
              <button type="button" className={styles.cancelEditBtn} onClick={handleCloseForm}>
                취소
              </button>
            </form>
          </div>
        </div>
        )}

        {/* ──────── 오른쪽: 캘린더 + 일정 상세 ──────── */}
        <div className={styles.rightPanel} style={!(isAdmin && showForm) ? { width: '100%' } : undefined}>
          {/* 조회 필터 — 캘린더와 아래 목록에 함께 적용된다 */}
          <div className={styles.card}>
            <div className={styles.filterBar}>
              <div className={styles.filterField}>
                <label className={styles.filterLabel}>기수</label>
                <select
                  className={styles.select}
                  value={viewCohort}
                  onChange={e => { setViewCohort(e.target.value); setViewClassId('') }}
                >
                  <option value="">전체 기수</option>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}기</option>)}
                </select>
              </div>

              <div className={styles.filterField}>
                <label className={styles.filterLabel}>반</label>
                <select className={styles.select} value={viewClassId} onChange={e => setViewClassId(e.target.value)}>
                  <option value="">전체 반</option>
                  {allClasses
                    .filter(c => !viewCohort || c.cohort === Number(viewCohort))
                    .map(c => <option key={c.id} value={c.id}>{c.cohort}기 {c.name}</option>)}
                </select>
              </div>

              <div className={styles.filterField}>
                <label className={styles.filterLabel}>담당 선생님</label>
                <select className={styles.select} value={viewTeacherId} onChange={e => setViewTeacherId(e.target.value)}>
                  <option value="">전체 선생님</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name} 선생님</option>)}
                </select>
              </div>

              {/* 교육차수(연 단위 프로그램 주기) — 학생 기수(cohort)와는 다른 개념이라 관리자만 노출 */}
              {isAdmin && (
                <div className={styles.filterField}>
                  <label className={styles.filterLabel}>교육차수</label>
                  <select className={styles.select} value={viewTerm} onChange={e => setViewTerm(e.target.value)}>
                    <option value="">전체 차수</option>
                    {terms.map(t => <option key={t.term} value={t.term}>{termOptionLabel(t)}</option>)}
                  </select>
                </div>
              )}

              {hasActiveFilter && (
                <button type="button" className={styles.filterResetBtn} onClick={resetFilters}>
                  ✕ 필터 해제
                </button>
              )}
            </div>

            {hasActiveFilter && (
              <div className={styles.filterSummary}>
                필터 적용 중 — 전체 {schedules.length}건 중 <strong>{filteredSchedules.length}건</strong> 표시 (캘린더에도 함께 적용됩니다)
              </div>
            )}
          </div>

          <div className={styles.card}>
            {/* 캘린더 헤더 */}
            <div className={styles.calHeader}>
              <button className={styles.calNavBtn} onClick={prevMonth}>‹</button>
              <h2 className={styles.calTitle}>{calYear}년 {calMonth + 1}월</h2>
              <button className={styles.calNavBtn} onClick={nextMonth}>›</button>
            </div>

            {/* 요일 헤더 */}
            <div className={styles.calScrollWrapper}>
              <div className={styles.calGrid}>
                {WEEK_LABELS.map((d, i) => (
                  <div key={d} className={`${styles.calWeekLabel} ${i === 0 ? styles.sun : i === 6 ? styles.sat : ''}`}>{d}</div>
                ))}

                {/* 날짜 셀 */}
                {calendarDays.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className={styles.calCell} />
                  const dateKey = toDateKey(day)
                  const daySchedules = scheduleMap[dateKey] || []
                  const isToday = dateKey === todayKey
                  const isSelected = dateKey === selectedDate
                  const isSun = idx % 7 === 0
                  const isSat = idx % 7 === 6

                  return (
                    <div
                      key={dateKey}
                      className={`${styles.calCell} ${styles.calCellDay} ${isToday ? styles.calToday : ''} ${isSelected ? styles.calSelected : ''}`}
                      onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                    >
                      <span className={`${styles.calDayNum} ${isSun ? styles.sun : isSat ? styles.sat : ''}`}>{day}</span>
                      <div className={styles.calDots}>
                        {daySchedules.slice(0, 3).map((sc, i) => {
                          const cfg = TYPE_CONFIG[sc.schedule_type] ?? { colorClass: 'typeGray' }
                          return <span key={i} className={`${styles.calDot} ${styles[cfg.colorClass + 'Dot']}`} title={sc.title} />
                        })}
                        {daySchedules.length > 3 && <span className={styles.calMoreDot}>+{daySchedules.length - 3}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 범례 */}
            <div className={styles.legend}>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <div key={key} className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles[cfg.colorClass + 'Dot']}`} />
                  <span>{cfg.icon} {cfg.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 선택된 날짜의 일정 또는 전체 일정 */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              {selectedDate
                ? `📋 ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} 일정 (${selectedSchedules.length}건)`
                : `🗓 오케스트라 ${showPast ? '전체' : '다가오는'} 확정 일정 (${upcomingSchedules.length + (showPast ? pastSchedules.length : 0)}건)`
              }
              {selectedDate && (
                <button className={styles.clearBtn} onClick={() => setSelectedDate(null)}>전체 보기</button>
              )}
            </h2>

            <div className={styles.listControls}>
              <select className={styles.select} style={{ maxWidth: 160 }} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="time">🕐 시간순</option>
                <option value="title">🔤 이름순</option>
              </select>
              {!selectedDate && (
                <label className={styles.pastToggle}>
                  <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
                  지난 일정 포함해서 보기
                </label>
              )}
            </div>

            {selectedDate ? (
              sortedSelectedSchedules.length === 0 ? (
                <div className={styles.empty}>
                  {hasActiveFilter ? '조건에 맞는 일정이 없습니다.' : '이 날에 등록된 일정이 없습니다.'}
                </div>
              ) : (
                sortedSelectedSchedules.map(sc => renderScheduleCard(sc))
              )
            ) : (
              <>
                {upcomingSchedules.length === 0 ? (
                  <div className={styles.empty}>
                    {hasActiveFilter ? '조건에 맞는 일정이 없습니다.' : '다가오는 일정이 없습니다.'}
                  </div>
                ) : (
                  upcomingSchedules.map(sc => renderScheduleCard(sc, false))
                )}

                {showPast && pastSchedules.length > 0 && (
                  <>
                    <div className={styles.pastDivider}><span>지난 일정</span></div>
                    {pastSchedules.map(sc => renderScheduleCard(sc, true))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}