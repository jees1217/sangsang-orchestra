'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './management.module.css'

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  online:          { label: '온라인 클래스', icon: '💻' },
  offline:         { label: '오프라인 합주', icon: '🎻' },
  rehearsal:       { label: '리허설',       icon: '🔄' },
  special_lecture: { label: '명사 특강',    icon: '🎓' },
  camp:            { label: '음악 캠프',    icon: '🏕️' },
  performance:     { label: '연주회',       icon: '🎉' },
  ot:              { label: '오리엔테이션', icon: '👋' },
}

interface Schedule {
  id: string
  title: string
  schedule_type: string
  schedule_date: string
  start_time: string
  end_time: string
  location: string | null
  target_type: string
  target_cohort: number[] | null
  target_class_id: string | null
  teacher_id: string | null
  target_class: { name: string; cohort: number | null } | null
  target_user: { name: string } | null
  teacher: { name: string } | null
}

export default function TeacherManagementPage() {
  const supabase = createClient()

  const [teacherId, setTeacherId] = useState('')
  const [myClasses, setMyClasses] = useState<{ id: string; cohort: number | null }[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const [showPast, setShowPast] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setTeacherId(user.id)

    const { data: classRows } = await supabase.from('classes')
      .select('id, cohort')
      .filter('teacher_ids', 'cs', `{${user.id}}`)

    // 일정은 지난 일정을 포함해 대상을 가리지 않고 전부 조회한 뒤 화면에서 걸러낸다.
    // (선생님 계정의 schedules RLS는 SELECT 전체 허용)
    const { data: scheduleRows } = await supabase.from('schedules')
      .select('id, title, schedule_type, schedule_date, start_time, end_time, location, target_type, target_cohort, target_class_id, teacher_id, target_class:target_class_id(name, cohort), target_user:target_user_id(name), teacher:teacher_id(name)')
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })

    setMyClasses((classRows || []) as any)
    setSchedules((scheduleRows as any) || [])
    setLoading(false)
  }

  const myClassIds = useMemo(() => new Set(myClasses.map(c => c.id)), [myClasses])
  const myCohorts = useMemo(
    () => new Set(myClasses.map(c => c.cohort).filter((c): c is number => c != null)),
    [myClasses]
  )

  // 공동 담임 반은 schedules.teacher_id에 대표 선생님 한 명만 저장되므로,
  // 담당 반 대상 일정도 "내 수업"으로 함께 인정한다.
  const isMine = (sc: Schedule) =>
    sc.teacher_id === teacherId || (!!sc.target_class_id && myClassIds.has(sc.target_class_id))

  // 전체 단원 일정, 그리고 내 담당 반의 기수를 대상으로 한 일정은 공통 일정으로 본다.
  const isCommon = (sc: Schedule) =>
    sc.target_type === 'all' ||
    (sc.target_type === 'cohort' && (sc.target_cohort || []).some(n => myCohorts.has(n)))

  const targetLabel = (sc: Schedule) => {
    switch (sc.target_type) {
      case 'all':
        return '전체 단원'
      case 'cohort':
        return sc.target_cohort?.length ? `${sc.target_cohort.join('·')}기` : '기수 대상'
      case 'class':
        return sc.target_class
          ? `${sc.target_class.cohort ? `${sc.target_class.cohort}기 ` : ''}${sc.target_class.name}`
          : '반 대상'
      case 'individual':
        return sc.target_user ? `${sc.target_user.name} 개인` : '개인'
      default:
        return '기타'
    }
  }

  // 타임존 문제 방지를 위해 로컬 날짜 문자열(YYYY-MM-DD)로 비교한다.
  const todayStr = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])
  const isPast = (sc: Schedule) => sc.schedule_date.substring(0, 10) < todayStr

  // 내 수업 + 공통 일정을 한 목록으로. 예정은 가까운 순, 지난 일정은 최신순으로 뒤에 붙인다.
  // (원본이 날짜 오름차순이므로 지난 쪽은 뒤집기만 하면 최신순)
  const { upcoming, pastList } = useMemo(() => {
    const list = schedules.filter(sc => isMine(sc) || isCommon(sc))
    return {
      upcoming: list.filter(sc => !isPast(sc)),
      pastList: list.filter(isPast).reverse(),
    }
  }, [schedules, teacherId, myClassIds, myCohorts, todayStr])

  const renderCard = (sc: Schedule, past: boolean) => {
    const cfg = TYPE_CONFIG[sc.schedule_type] ?? { label: sc.schedule_type, icon: '📌' }
    const isOnline = sc.schedule_type === 'online'
    const mine = isMine(sc)

    return (
      <div
        key={sc.id}
        className={`${styles.scheduleCard} ${mine ? styles.scheduleCardMine : ''} ${past ? styles.scheduleCardPast : ''}`}
      >
        <div className={styles.scTop}>
          <span className={`${styles.typeBadge} ${isOnline ? styles.badgeOnline : styles.badgeDefault}`}>
            {cfg.icon} {cfg.label}
          </span>
          <span className={styles.classBadge}>{targetLabel(sc)}</span>
          {mine && <span className={styles.mineBadge}>내 수업</span>}
        </div>

        <div className={styles.scTitle}>{sc.title}</div>
        <div className={styles.scMeta}>
          <span>🗓 {sc.schedule_date.substring(0, 10)}</span>
          <span>⏰ {sc.start_time.substring(0, 5)} ~ {sc.end_time.substring(0, 5)}</span>
          {sc.teacher?.name && <span>👤 {sc.teacher.name}</span>}
        </div>

        {/* 온라인: 링크 */}
        {isOnline && (
          <div className={styles.linkArea}>
            {sc.location ? (
              <a href={sc.location} target="_blank" rel="noreferrer" className={styles.linkAnchor}>
                🔗 수업 링크 열기
              </a>
            ) : (
              <span className={styles.noLink}>링크 미등록</span>
            )}
          </div>
        )}

        {/* 오프라인: 장소 */}
        {!isOnline && sc.location && (
          <div className={styles.scLocation}>📍 {sc.location}</div>
        )}
      </div>
    )
  }

  if (loading) return <div className={styles.loading}>불러오는 중...</div>

  const visibleCount = upcoming.length + (showPast ? pastList.length : 0)

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>📚 수업 관리</h1>
        <label className={styles.pastToggle}>
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
          지난 일정 포함해서 보기
        </label>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          {showPast ? '전체 일정' : '다가오는 일정'}
          <span className={styles.countBadge}>{visibleCount}건</span>
        </h2>

        {visibleCount === 0 ? (
          <div className={styles.empty}>
            {showPast ? '등록된 일정이 없습니다.' : '다가오는 일정이 없습니다.'}
          </div>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <div className={styles.empty}>다가오는 일정이 없습니다.</div>
            ) : (
              upcoming.map(sc => renderCard(sc, false))
            )}

            {showPast && pastList.length > 0 && (
              <>
                <div className={styles.pastDivider}><span>지난 일정</span></div>
                {pastList.map(sc => renderCard(sc, true))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
