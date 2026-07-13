'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './schedules.module.css'

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export default function StudentSchedulesPage() {
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<any[]>([])
  const [showPast, setShowPast] = useState(false)
  const supabase = createClient()

  // 타임존 문제 방지를 위해 로컬 날짜 문자열(YYYY-MM-DD) 추출
  const today = new Date()
  const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0]

  useEffect(() => {
    fetchMySchedules()
  }, [])

  const fetchMySchedules = async () => {
    try {
      // 1. 현재 로그인한 학생 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: student } = await supabase
        .from('users')
        .select('cohort, class_id')
        .eq('id', user.id)
        .single()

      if (!student) return

      // 2. 전체 일정을 오름차순으로 가져오기 (지난 일정 포함)
      const { data: allSchedules } = await supabase
        .from('schedules')
        .select('*, teacher:teacher_id(name)')
        .order('schedule_date', { ascending: true })
        .order('start_time', { ascending: true })

      // 3. 나에게 해당하는 일정만 영리하게 필터링
      const mySchedules = (allSchedules || []).filter(sc => {
        if (sc.target_type === 'all') return true
        if (sc.target_type === 'cohort' && (sc.target_cohort || []).includes(student.cohort)) return true
        if (sc.target_type === 'class' && sc.target_class_id === student.class_id) return true
        if (sc.target_type === 'individual' && sc.target_user_id === user.id) return true
        return false
      })

      setSchedules(mySchedules)
    } catch (error) {
      console.error('일정 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const visibleSchedules = showPast
    ? schedules
    : schedules.filter(sc => sc.schedule_date.substring(0, 10) >= todayStr)

  // 뱃지 색상 매퍼
  const getScheduleTypeBadge = (type: string) => {
    switch (type) {
      case 'online': return <span className={`${styles.badge} ${styles.bgMint}`}>💻 온라인 수업</span>
      case 'offline': return <span className={`${styles.badge} ${styles.bgBlue}`}>🎻 오프라인 합주</span>
      case 'special_lecture': return <span className={`${styles.badge} ${styles.bgPurple}`}>🎓 명사 특강</span>
      case 'camp': return <span className={`${styles.badge} ${styles.bgOrange}`}>🏕️ 음악 캠프</span>
      case 'performance': return <span className={`${styles.badge} ${styles.bgPurple}`}>🎉 공연/연주회</span>
      case 'rehearsal': return <span className={`${styles.badge} ${styles.bgGray}`}>🔄 리허설</span>
      case 'ot': return <span className={`${styles.badge} ${styles.bgGray}`}>👋 오리엔테이션</span>
      default: return null
    }
  }

  if (loading) return <div className={styles.loading}>나의 일정을 정리해서 가져오고 있습니다...</div>

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>🗓️ {showPast ? '나의 전체 일정' : '다가오는 내 수업 및 일정'}</h1>
          <p className={styles.subtitle}>
            나에게 배정된 온라인 수업, 오프라인 합주, 그리고 특별 일정들을 확인하세요.<br/>
            상세한 프로그램 내용이나 준비물은 공지사항을 참고해 주시기 바랍니다.
          </p>
        </div>
        <label className={styles.pastToggle}>
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
          지난 일정 포함해서 보기
        </label>
      </div>

      {visibleSchedules.length === 0 ? (
        <div className={styles.empty}>
          {showPast ? '등록된 일정이 없습니다.' : '다가오는 일정이 없습니다. 푹 쉬면서 개인 연습에 집중해 보세요! 🎵'}
        </div>
      ) : (
        <div className={styles.grid}>
          {visibleSchedules.map((sc) => {
            const dateObj = new Date(sc.schedule_date)
            const month = dateObj.getMonth() + 1
            const day = dateObj.getDate()
            const dayOfWeek = DAY_NAMES[dateObj.getDay()]
            const isPast = sc.schedule_date.substring(0, 10) < todayStr

            // 장소가 링크인지 텍스트인지 판별
            const isLink = sc.location && sc.location.startsWith('http')

            return (
              <div key={sc.id} className={`${styles.card} ${isPast ? styles.pastCard : ''}`}>
                {/* 왼쪽 달력 아이콘 느낌의 날짜 박스 */}
                <div className={styles.dateBox}>
                  <span className={styles.month}>{month}월</span>
                  <span className={styles.day}>{day}</span>
                  <span className={styles.dayOfWeek}>{dayOfWeek}</span>
                </div>

                {/* 오른쪽 상세 정보 */}
                <div className={styles.infoBox}>
                  <div className={styles.titleRow}>
                    {getScheduleTypeBadge(sc.schedule_type)}
                    <span className={styles.scTitle}>{sc.title}</span>
                  </div>
                  
                  <div className={styles.metaRow}>
                    <div className={styles.metaItem}>
                      <span>⏰</span>
                      <span>{sc.start_time.substring(0, 5)} ~ {sc.end_time.substring(0, 5)}</span>
                    </div>
                    {sc.teacher && (
                      <div className={styles.metaItem}>
                        <span>👨‍🏫</span>
                        <span>{sc.teacher.name} 선생님</span>
                      </div>
                    )}
                  </div>

                  {sc.location && (
                    <div className={styles.location}>
                      📍 장소/링크:{' '}
                      {isLink ? (
                        <a href={sc.location} target="_blank" rel="noopener noreferrer" className={styles.link}>
                          {sc.location} ↗
                        </a>
                      ) : (
                        sc.location
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}