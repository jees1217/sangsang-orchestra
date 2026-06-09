'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './management.module.css'

const TYPE_CONFIG = {
  online:          { label: '온라인 클래스', icon: '💻' },
  offline:         { label: '오프라인 합주', icon: '🎻' },
  rehearsal:       { label: '리허설',       icon: '🔄' },
  special_lecture: { label: '명사 특강',    icon: '🎓' },
  performance:     { label: '연주회',       icon: '🎉' },
  ot:              { label: '오리엔테이션', icon: '👋' },
}

interface ClassData {
  id: string
  name: string
  cohort: number | null
  meeting_link: string | null
}

interface Schedule {
  id: string
  title: string
  schedule_type: string
  schedule_date: string
  start_time: string
  end_time: string
  location: string | null
  target_class_id: string | null
  target_class: { name: string; cohort: number } | null
}

export default function TeacherManagementPage() {
  const supabase = createClient()

  const [teacherId, setTeacherId] = useState('')
  const [myClasses, setMyClasses] = useState<ClassData[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  // 일정 등록 폼
  const [scheduleType, setScheduleType] = useState('online')
  const [targetClassId, setTargetClassId] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [title, setTitle] = useState('')
  const [isTitleManual, setIsTitleManual] = useState(false)
  const [location, setLocation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 일정 링크 인라인 편집
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [editingLink, setEditingLink] = useState('')
  const [savingLink, setSavingLink] = useState(false)

  // 반 고정 링크 편집
  const [classLinkDraft, setClassLinkDraft] = useState<Record<string, string>>({})
  const [savingClassLink, setSavingClassLink] = useState<string | null>(null)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setTeacherId(user.id)

    const todayStr = new Date().toISOString().split('T')[0]

    const [{ data: classRows }, { data: scheduleRows }] = await Promise.all([
      supabase.from('classes')
        .select('id, name, cohort, meeting_link')
        .filter('teacher_ids', 'cs', `{${user.id}}`)
        .order('name'),
      supabase.from('schedules')
        .select('id, title, schedule_type, schedule_date, start_time, end_time, location, target_class_id, target_class:target_class_id(name, cohort)')
        .eq('teacher_id', user.id)
        .gte('schedule_date', todayStr)
        .order('schedule_date', { ascending: true })
        .order('start_time', { ascending: true }),
    ])

    const classes = (classRows || []) as ClassData[]
    setMyClasses(classes)
    setSchedules((scheduleRows as any) || [])

    const draft: Record<string, string> = {}
    classes.forEach(c => { draft[c.id] = c.meeting_link || '' })
    setClassLinkDraft(draft)

    if (classes.length > 0) setTargetClassId(classes[0].id)
    setLoading(false)
  }

  const refreshSchedules = async (uid: string) => {
    const todayStr = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('schedules')
      .select('id, title, schedule_type, schedule_date, start_time, end_time, location, target_class_id, target_class:target_class_id(name, cohort)')
      .eq('teacher_id', uid)
      .gte('schedule_date', todayStr)
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })
    setSchedules((data as any) || [])
  }

  const autoTitle = useMemo(() => {
    const typeName = TYPE_CONFIG[scheduleType as keyof typeof TYPE_CONFIG]?.label || scheduleType
    const cls = myClasses.find(c => c.id === targetClassId)
    if (!cls) return typeName
    return `${cls.cohort ? cls.cohort + '기 ' : ''}${cls.name} ${typeName}`
  }, [scheduleType, targetClassId, myClasses])

  const effectiveTitle = isTitleManual ? title : autoTitle

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (startTime >= endTime) return alert('종료 시간은 시작 시간보다 늦어야 합니다.')
    if (!targetClassId) return alert('담당 반을 선택해주세요.')
    setIsSubmitting(true)
    try {
      const { error } = await supabase.from('schedules').insert({
        title: effectiveTitle,
        schedule_type: scheduleType,
        schedule_date: scheduleDate,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        teacher_id: teacherId,
        location: location || null,
        target_type: 'class',
        target_class_id: targetClassId,
        created_by: teacherId,
      })
      if (error) throw error
      alert('수업 일정이 등록되었습니다.')
      setTitle(''); setIsTitleManual(false); setLocation(''); setScheduleDate('')
      await refreshSchedules(teacherId)
    } catch (err) {
      console.error(err)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('이 수업 일정을 삭제하시겠습니까?')) return
    await supabase.from('schedules').delete().eq('id', id)
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  const handleSaveScheduleLink = async (scheduleId: string) => {
    setSavingLink(true)
    try {
      const { error } = await supabase.from('schedules')
        .update({ location: editingLink || null }).eq('id', scheduleId)
      if (error) throw error
      setSchedules(prev => prev.map(s =>
        s.id === scheduleId ? { ...s, location: editingLink || null } : s
      ))
      setEditingLinkId(null)
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSavingLink(false)
    }
  }

  const handleSaveClassLink = async (classId: string) => {
    setSavingClassLink(classId)
    try {
      const { error } = await supabase.from('classes')
        .update({ meeting_link: classLinkDraft[classId] || null }).eq('id', classId)
      if (error) throw error
      setMyClasses(prev => prev.map(c =>
        c.id === classId ? { ...c, meeting_link: classLinkDraft[classId] || null } : c
      ))
      alert('링크가 저장되었습니다.')
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSavingClassLink(null)
    }
  }

  if (loading) return <div className={styles.loading}>불러오는 중...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>📚 수업 관리</h1>

      <div className={styles.layout}>

        {/* ── 왼쪽: 등록 폼 + 반 링크 ── */}
        <div className={styles.leftPanel}>

          {/* 수업 일정 등록 */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>수업 일정 등록</h2>
            {myClasses.length === 0 ? (
              <div className={styles.empty}>배정된 반이 없습니다. 관리자에게 반 배정을 요청하세요.</div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>수업 유형</label>
                  <select className={styles.select} value={scheduleType} onChange={e => setScheduleType(e.target.value)}>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>담당 반</label>
                  <select className={styles.select} value={targetClassId} onChange={e => setTargetClassId(e.target.value)}>
                    {myClasses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.cohort ? `${c.cohort}기 ` : ''}{c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>수업 제목</label>
                  <input
                    type="text"
                    className={styles.input}
                    required
                    value={effectiveTitle}
                    onChange={e => {
                      const v = e.target.value
                      if (v === '' || v === autoTitle) { setIsTitleManual(false); setTitle('') }
                      else { setIsTitleManual(true); setTitle(v) }
                    }}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>날짜</label>
                  <input type="date" className={styles.input} required value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>시간</label>
                  <div className={styles.row}>
                    <input type="time" className={styles.input} required value={startTime} onChange={e => setStartTime(e.target.value)} />
                    <span className={styles.sep}>~</span>
                    <input type="time" className={styles.input} required value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {scheduleType === 'online' ? 'Zoom / Meet 링크' : '장소'}
                  </label>
                  <input
                    type={scheduleType === 'online' ? 'url' : 'text'}
                    className={styles.input}
                    placeholder={scheduleType === 'online' ? 'https://zoom.us/j/...' : '예: 연습실 3호'}
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                  />
                </div>

                <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                  {isSubmitting ? '등록 중...' : '✅ 수업 일정 등록'}
                </button>
              </form>
            )}
          </div>

          {/* 담당 반 고정 링크 */}
          {myClasses.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>담당 반 고정 링크</h2>
              <p className={styles.cardDesc}>반별 상시 Zoom/Meet 링크를 등록하면 학생들이 언제든지 확인할 수 있습니다.</p>
              {myClasses.map(c => (
                <div key={c.id} className={styles.classLinkBlock}>
                  <div className={styles.classLinkName}>
                    {c.cohort ? `${c.cohort}기 ` : ''}{c.name}
                  </div>
                  <div className={styles.linkEditRow}>
                    <input
                      type="url"
                      className={styles.input}
                      placeholder="https://zoom.us/j/..."
                      value={classLinkDraft[c.id] || ''}
                      onChange={e => setClassLinkDraft(prev => ({ ...prev, [c.id]: e.target.value }))}
                    />
                    <button
                      className={styles.saveLinkBtn}
                      onClick={() => handleSaveClassLink(c.id)}
                      disabled={savingClassLink === c.id}
                    >
                      {savingClassLink === c.id ? '…' : '저장'}
                    </button>
                  </div>
                  {c.meeting_link && (
                    <a href={c.meeting_link} target="_blank" rel="noreferrer" className={styles.linkPreview}>
                      🔗 현재 링크 열기
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 오른쪽: 등록된 수업 일정 ── */}
        <div className={styles.rightPanel}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              등록된 수업 일정
              <span className={styles.countBadge}>{schedules.length}건</span>
            </h2>

            {schedules.length === 0 ? (
              <div className={styles.empty}>등록된 수업 일정이 없습니다.</div>
            ) : schedules.map(sc => {
              const cfg = TYPE_CONFIG[sc.schedule_type as keyof typeof TYPE_CONFIG] ?? { label: sc.schedule_type, icon: '📌' }
              const isOnline = sc.schedule_type === 'online'
              const isEditingLink = editingLinkId === sc.id

              return (
                <div key={sc.id} className={styles.scheduleCard}>
                  <div className={styles.scTop}>
                    <span className={`${styles.typeBadge} ${isOnline ? styles.badgeOnline : styles.badgeDefault}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    {sc.target_class && (
                      <span className={styles.classBadge}>
                        {sc.target_class.cohort ? `${sc.target_class.cohort}기 ` : ''}{sc.target_class.name}
                      </span>
                    )}
                    <button className={styles.deleteBtn} onClick={() => handleDeleteSchedule(sc.id)}>삭제</button>
                  </div>

                  <div className={styles.scTitle}>{sc.title}</div>
                  <div className={styles.scMeta}>
                    <span>🗓 {sc.schedule_date.substring(0, 10)}</span>
                    <span>⏰ {sc.start_time.substring(0, 5)} ~ {sc.end_time.substring(0, 5)}</span>
                  </div>

                  {/* 온라인: 링크 영역 */}
                  {isOnline && (
                    <div className={styles.linkArea}>
                      {isEditingLink ? (
                        <div className={styles.linkEditRow}>
                          <input
                            type="url"
                            className={styles.input}
                            placeholder="https://zoom.us/j/..."
                            value={editingLink}
                            onChange={e => setEditingLink(e.target.value)}
                            autoFocus
                          />
                          <button className={styles.saveLinkBtn} onClick={() => handleSaveScheduleLink(sc.id)} disabled={savingLink}>
                            {savingLink ? '…' : '저장'}
                          </button>
                          <button className={styles.cancelLinkBtn} onClick={() => setEditingLinkId(null)}>취소</button>
                        </div>
                      ) : sc.location ? (
                        <div className={styles.linkDisplay}>
                          <a href={sc.location} target="_blank" rel="noreferrer" className={styles.linkAnchor}>🔗 수업 링크 열기</a>
                          <button className={styles.editLinkBtn} onClick={() => { setEditingLinkId(sc.id); setEditingLink(sc.location || '') }}>수정</button>
                        </div>
                      ) : (
                        <div className={styles.linkDisplay}>
                          <span className={styles.noLink}>링크 미등록</span>
                          <button className={styles.editLinkBtn} onClick={() => { setEditingLinkId(sc.id); setEditingLink('') }}>링크 추가</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 오프라인: 장소 */}
                  {!isOnline && sc.location && (
                    <div className={styles.scLocation}>📍 {sc.location}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
