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
  const [myClassIds, setMyClassIds] = useState<Set<string>>(new Set())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  // 일정 목록 범위: 전체(공통일정 포함) / 내 수업만 — 기본은 내 수업
  const [scope, setScope] = useState<'all' | 'mine'>('mine')
  // 지난 일정은 기본으로 접어둔다 (예정 일정이 먼저 눈에 들어오도록)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setTeacherId(user.id)

    const { data: classRows } = await supabase.from('classes')
      .select('id')
      .filter('teacher_ids', 'cs', `{${user.id}}`)

    // 일정은 지난 일정을 포함해 대상을 가리지 않고 전부 조회한다 — 전체 단원/기수 대상
    // 공통일정도 선생님이 함께 봐야 하므로 날짜·teacher_id·담당 반으로 좁히지 않는다.
    // (선생님 계정의 schedules RLS는 SELECT 전체 허용)
    const { data: scheduleRows } = await supabase.from('schedules')
      .select('id, title, schedule_type, schedule_date, start_time, end_time, location, target_type, target_cohort, target_class_id, teacher_id, target_class:target_class_id(name, cohort), target_user:target_user_id(name), teacher:teacher_id(name)')
      .order('schedule_date', { ascending: true })
      .order('start_time', { ascending: true })

    setMyClassIds(new Set((classRows || []).map((c: any) => c.id)))
    setSchedules((scheduleRows as any) || [])
    setLoading(false)
  }

  // 공동 담임 반은 schedules.teacher_id에 대표 선생님 한 명만 저장되므로,
  // 담당 반 대상 일정도 "내 수업"으로 함께 인정한다.
  const isMine = (sc: Schedule) =>
    sc.teacher_id === teacherId || (!!sc.target_class_id && myClassIds.has(sc.target_class_id))

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

  // toISOString()은 UTC 기준이라 KST 자정~오전 9시 사이에 하루 전 날짜가 나온다.
  // "오늘 이후인가"를 판단하는 값이므로 브라우저 로컬 날짜로 만든다.
  const todayStr = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])
  const isPast = (sc: Schedule) => sc.schedule_date.substring(0, 10) < todayStr

  // 예정(오늘 포함) 일정은 가까운 순, 지난 일정은 최신순으로 나눠 둔다.
  // 원본 schedules가 날짜 오름차순이므로 지난 쪽은 뒤집기만 하면 최신순이 된다.
  const { upcoming, pastList } = useMemo(() => {
    const list = scope === 'mine' ? schedules.filter(isMine) : schedules
    return {
      upcoming: list.filter(sc => !isPast(sc)),
      pastList: list.filter(isPast).reverse(),
    }
  }, [schedules, scope, teacherId, myClassIds, todayStr])

  const mineCount = useMemo(() => schedules.filter(isMine).length, [schedules, teacherId, myClassIds])

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

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>📚 수업 관리</h1>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          전체 일정
          <span className={styles.countBadge}>{upcoming.length + pastList.length}건</span>
        </h2>

        <div className={styles.filterRow}>
          <button
            className={`${styles.filterChip} ${scope === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setScope('all')}
          >
            전체 {schedules.length}
          </button>
          <button
            className={`${styles.filterChip} ${scope === 'mine' ? styles.filterChipActive : ''}`}
            onClick={() => setScope('mine')}
          >
            내 수업 {mineCount}
          </button>
        </div>

        {upcoming.length === 0 && pastList.length === 0 ? (
          <div className={styles.empty}>
            {scope === 'mine' ? '내 수업 일정이 없습니다.' : '등록된 일정이 없습니다.'}
          </div>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <div className={styles.empty}>예정된 일정이 없습니다.</div>
            ) : (
              upcoming.map(sc => renderCard(sc, false))
            )}

            {pastList.length > 0 && (
              <>
                <button
                  type="button"
                  className={styles.pastToggle}
                  onClick={() => setShowPast(v => !v)}
                >
                  <span className={styles.pastToggleChevron}>{showPast ? '▾' : '▸'}</span>
                  지난 일정 {pastList.length}건 {showPast ? '접기' : '펼쳐보기'}
                </button>
                {showPast && pastList.map(sc => renderCard(sc, true))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
