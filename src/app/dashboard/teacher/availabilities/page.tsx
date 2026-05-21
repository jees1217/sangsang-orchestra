'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './availabilities.module.css'

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export default function TeacherAvailabilitiesPage() {
  const [loading, setLoading] = useState(true)
  const [teacherId, setTeacherId] = useState<string>('')
  const [availabilities, setAvailabilities] = useState<any[]>([])

  // 폼 상태
  const [dayOfWeek, setDayOfWeek] = useState<number>(1) // 기본 월요일
  const [startTime, setStartTime] = useState<string>('09:00')
  const [endTime, setEndTime] = useState<string>('12:00')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchAvailabilities()
  }, [])

  const fetchAvailabilities = async () => {
    try {
      // 1. 현재 로그인한 선생님 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setTeacherId(user.id)

      // 2. 해당 선생님이 등록한 가용 시간 목록 조회
      const { data } = await supabase
        .from('teacher_availabilities')
        .select('*')
        .eq('teacher_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })

      setAvailabilities(data || [])
    } catch (error) {
      console.error('가용 시간 조회 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 가용 시간 추가 등록
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (startTime >= endTime) {
      return alert('종료 시간은 시작 시간보다 늦어야 합니다.')
    }

    setIsSubmitting(true)
    try {
      // 수파베이스 장부에 시간 추가 (초 단위 분리를 위해 HH:MM:00 형태로 포맷팅)
      const { error } = await supabase
        .from('teacher_availabilities')
        .insert({
          teacher_id: teacherId,
          day_of_week: dayOfWeek,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`
        })

      if (error) {
        if (error.code === '23505') {
          return alert('이미 동일한 시간에 등록된 가용 시간이 있습니다.')
        }
        throw error
      }

      alert('출강 가용 시간이 등록되었습니다.')
      fetchAvailabilities() // 목록 새로고침
    } catch (error) {
      console.error('등록 실패:', error)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 등록된 가용 시간 삭제
  const handleDelete = async (id: string) => {
    if (!window.confirm('해당 가용 시간을 삭제하시겠습니까?')) return

    try {
      const { error } = await supabase
        .from('teacher_availabilities')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchAvailabilities() // 목록 새로고침
    } catch (error) {
      console.error('삭제 실패:', error)
      alert('삭제 처리 중 오류가 발생했습니다.')
    }
  }

  // TIME 형태(HH:MM:SS)에서 초 단위를 자르고 HH:MM만 보여주는 가독성 변환기
  const formatTime = (timeStr: string) => {
    if (!timeStr) return ''
    return timeStr.substring(0, 5)
  }

  if (loading) return <div className={styles.loading}>출강 정보 장부를 열고 있습니다...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🗓️ 내 출강 가능 시간 설정</h1>
      <p className={styles.subtitle}>
        선생님께서 정규 수업(주중 온라인 / 주말 오프라인) 및 특강 지도가 가능한 요일과 시간대를 설정해 주세요.<br />
        관리자가 이 데이터를 바탕으로 전체 통합 시간표를 조율하고 배정하게 됩니다.
      </p>

      <div className={styles.layout}>
        {/* 왼쪽: 시간 등록 폼 */}
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>출강 가능 시간 추가</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.label}>요일 선택</label>
              <select className={styles.select} value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))}>
                <option value={1}>월요일</option>
                <option value={2}>화요일</option>
                <option value={3}>수요일</option>
                <option value={4}>목요일</option>
                <option value={5}>금요일</option>
                <option value={6}>토요일</option>
                <option value={0}>일요일</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>시작 시간</label>
              <input type="time" className={styles.input} value={startTime} onChange={e => setStartTime(e.target.value)} required />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>종료 시간</label>
              <input type="time" className={styles.input} value={endTime} onChange={e => setEndTime(e.target.value)} required />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '가용 시간에 추가'}
            </button>
          </form>
        </div>

        {/* 오른쪽: 내 가용 시간 리스트 */}
        <div className={styles.listCard}>
          <h2 className={styles.listTitle}>내가 제출한 가용 시간 목록 ({availabilities.length}개)</h2>
          {availabilities.length === 0 ? (
            <div className={styles.empty}>등록된 시간대가 없습니다. 출강 가능한 스케줄을 입력해 주세요!</div>
          ) : (
            availabilities.map((item) => (
              <div key={item.id} className={styles.timeRow}>
                <div className={styles.timeInfo}>
                  <span className={styles.dayBadge}>{DAYS[item.day_of_week]}</span>
                  <span className={styles.timeText}>
                    {formatTime(item.start_time)} ~ {formatTime(item.end_time)}
                  </span>
                </div>
                <button className={styles.deleteBtn} onClick={() => handleDelete(item.id)}>지우기</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}