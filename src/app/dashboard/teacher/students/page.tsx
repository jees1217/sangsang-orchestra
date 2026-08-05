'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeAttendanceStats, excusedKey, absenceBreakdown, fetchCurrentTerm, scopeToTerm,
  fetchAllPages, PAGE_SIZE, rateColorByAbsence, type TermWindow,
} from '@/lib/attendance'
import styles from './students.module.css'

const STATUS_CONFIG = {
  PRESENT: { label: '출석', color: '#16a34a', bg: '#dcfce7' },
  LATE:    { label: '지각', color: '#d97706', bg: '#fef3c7' },
  ABSENT:  { label: '결석', color: '#dc2626', bg: '#fee2e2' },
}

interface Student {
  id: string
  name: string
  cohort: string | null
  instrument: string | null
  attendanceRate: number
  presentCount: number
  lateCount: number
  absentCount: number
  excusedCount: number
  convertedAbsent: number
  effectiveAbsent: number
}

interface AttendanceRecord {
  id: string
  date: string
  status: 'PRESENT' | 'LATE' | 'ABSENT'
  schedule_id: string | null
}

interface EvalRecord {
  id: string
  score: number
  comment: string
  created_at: string
  writer: { name: string }
}

export default function TeacherStudentsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [teacherId, setTeacherId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([])
  const [excusedScheduleIds, setExcusedScheduleIds] = useState<Set<string>>(new Set())
  // 출결 집계 구간 = 진행 중인 기수. null 이면 기수 미설정이라 전 기간으로 집계한다.
  const [termWindow, setTermWindow] = useState<TermWindow>(null)
  const [currentTerm, setCurrentTerm] = useState<number | null>(null)
  const [evalLogs, setEvalLogs] = useState<EvalRecord[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // 평가 작성 폼
  const [score, setScore] = useState(100)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (selected) loadDetail(selected.id)
  }, [selected])

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setTeacherId(user.id)

      // 담당 학생 ID 목록
      const { data: classRows } = await supabase
        .from('classes')
        .select('student_id')
        .filter('teacher_ids', 'cs', `{${user.id}}`)

      const studentIds = [...new Set((classRows || []).map((r: any) => r.student_id).filter(Boolean))]

      if (studentIds.length === 0) {
        setStudents([])
        setLoading(false)
        return
      }

      // 학생 기본 정보
      const { data: userRows } = await supabase
        .from('users')
        .select('id, name, cohort, instrument')
        .in('id', studentIds)
        .eq('is_active', true)
        .order('name')

      // 집계 구간 = 진행 중인 기수 (미설정이면 전 기간)
      const term = await fetchCurrentTerm(supabase)
      setTermWindow(term)
      setCurrentTerm(term ? term.term : null)

      const [attRows, subRows] = await Promise.all([
        fetchAllPages(from => scopeToTerm(supabase
          .from('attendances')
          .select('student_id, status, schedule_id')
          .in('student_id', studentIds), term)
          .order('id').range(from, from + PAGE_SIZE - 1)),
        fetchAllPages(from => supabase
          .from('attendance_substitutions')
          .select('student_id, schedule_id')
          .in('student_id', studentIds)
          .eq('status', 'approved')
          .order('id').range(from, from + PAGE_SIZE - 1)),
      ])

      const excused = new Set(subRows.map((s: any) => excusedKey(s.student_id, s.schedule_id)))

      // 학생별 출석 집계
      const attMap: Record<string, { present: number; late: number; absent: number; excused: number }> = {}
      attRows.forEach((a: any) => {
        if (!attMap[a.student_id]) attMap[a.student_id] = { present: 0, late: 0, absent: 0, excused: 0 }
        if (a.status === 'PRESENT') attMap[a.student_id].present++
        else if (a.status === 'LATE')    attMap[a.student_id].late++
        else if (a.status === 'ABSENT') {
          // 출석 대체가 승인된 결석은 '인정'으로 빼고 결석/모수에서 제외한다.
          if (a.schedule_id != null && excused.has(excusedKey(a.student_id, a.schedule_id))) attMap[a.student_id].excused++
          else attMap[a.student_id].absent++
        }
      })

      const list: Student[] = (userRows || []).map((u: any) => {
        const att = attMap[u.id] || { present: 0, late: 0, absent: 0, excused: 0 }
        // 지각 3회 = 결석 1회로 환산해 해당 기수 출석률을 계산한다.
        const stats = computeAttendanceStats(att)
        return {
          id: u.id,
          name: u.name,
          cohort: u.cohort,
          instrument: u.instrument,
          presentCount: att.present,
          lateCount: att.late,
          absentCount: att.absent,
          excusedCount: att.excused,
          convertedAbsent: stats.convertedAbsent,
          effectiveAbsent: stats.effectiveAbsent,
          attendanceRate: stats.rate,
        }
      })

      setStudents(list)
    } catch (err) {
      console.error('학생 목록 로딩 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (studentId: string) => {
    setDetailLoading(true)
    try {
      const [{ data: attData }, { data: evalData }, { data: subData }] = await Promise.all([
        scopeToTerm(supabase
          .from('attendances')
          .select('id, date, status, schedule_id')
          .eq('student_id', studentId), termWindow)
          .order('date', { ascending: false })
          .limit(15),
        supabase
          .from('evaluations')
          .select('id, score, comment, created_at, writer:writer_id(name)')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('attendance_substitutions')
          .select('schedule_id')
          .eq('student_id', studentId)
          .eq('status', 'approved'),
      ])
      setAttendanceLogs((attData as any) || [])
      setExcusedScheduleIds(new Set((subData || []).map((s: any) => s.schedule_id)))
      setEvalLogs((evalData as any) || [])
    } finally {
      setDetailLoading(false)
    }
  }

  const handleEvalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !teacherId) return
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('evaluations')
        .insert({ student_id: selected.id, writer_id: teacherId, score, comment: comment.trim() })
      if (error) throw error
      setScore(100)
      setComment('')
      loadDetail(selected.id)
    } catch (err) {
      console.error('평가 등록 실패:', err)
      alert('평가 등록 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className={styles.loading}>학생 명단을 불러오는 중...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>👥 내 학생 관리</h1>
      <p className={styles.subtitle}>
        담당 학생 {students.length}명 · {currentTerm !== null ? `${currentTerm}기` : '전 기간'} 출석 기준
      </p>

      {students.length === 0 ? (
        <div className={styles.empty}>담당 학생이 배정되지 않았습니다.</div>
      ) : (
        <div className={styles.layout}>

          {/* ── 왼쪽: 학생 목록 ── */}
          <div className={styles.listPanel}>
            {students.map(s => {
              const rateColor = rateColorByAbsence(s.effectiveAbsent)
              return (
                <div
                  key={s.id}
                  className={`${styles.studentCard} ${selected?.id === s.id ? styles.studentCardActive : ''}`}
                  onClick={() => setSelected(s)}
                >
                  <div className={styles.studentAvatar}>{s.name.charAt(0)}</div>
                  <div className={styles.studentInfo}>
                    <div className={styles.studentName}>{s.name}</div>
                    <div className={styles.studentMeta}>
                      {s.instrument && <span className={styles.metaTag}>{s.instrument}</span>}
                      {s.cohort && <span className={styles.metaTag}>{s.cohort}기</span>}
                    </div>
                  </div>
                  <div className={styles.rateWrap}>
                    <span className={styles.rateNum} style={{ color: rateColor }}>
                      {s.attendanceRate}%
                    </span>
                    <span className={styles.rateLabel}>출석률</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── 오른쪽: 학생 상세 ── */}
          <div className={styles.detailPanel}>
            {!selected ? (
              <div className={styles.placeholder}>
                <span className={styles.placeholderIcon}>👈</span>
                <p>왼쪽에서 학생을 선택해 주세요.</p>
              </div>
            ) : detailLoading ? (
              <div className={styles.loading}>정보를 불러오는 중...</div>
            ) : (
              <>
                {/* 학생 프로필 헤더 */}
                <div className={styles.profileHeader}>
                  <div className={styles.profileAvatar}>{selected.name.charAt(0)}</div>
                  <div>
                    <div className={styles.profileName}>{selected.name}</div>
                    <div className={styles.profileTags}>
                      {selected.instrument && <span className={styles.profileTag}>{selected.instrument}</span>}
                      {selected.cohort && <span className={styles.profileTag}>{selected.cohort}기</span>}
                    </div>
                  </div>
                  <div className={styles.profileStats}>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatNum} style={{ color: '#16a34a' }}>{selected.presentCount}</span>
                      <span className={styles.profileStatLabel}>출석</span>
                    </div>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatNum} style={{ color: '#d97706' }}>{selected.lateCount}</span>
                      <span className={styles.profileStatLabel}>지각</span>
                    </div>
                    {selected.excusedCount > 0 && (
                      <div className={styles.profileStat} title="출석 대체가 승인되어 결석에서 차감된 횟수">
                        <span className={styles.profileStatNum} style={{ color: '#2563eb' }}>-{selected.excusedCount}</span>
                        <span className={styles.profileStatLabel}>인정</span>
                      </div>
                    )}
                    <div className={styles.profileStat} title={absenceBreakdown({
                      absent: selected.absentCount, excused: selected.excusedCount,
                      convertedAbsent: selected.convertedAbsent, effectiveAbsent: selected.effectiveAbsent,
                    }) ?? undefined}>
                      <span className={styles.profileStatNum} style={{ color: '#dc2626' }}>
                        {selected.effectiveAbsent}
                        {selected.convertedAbsent > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}> (+{selected.convertedAbsent})</span>
                        )}
                      </span>
                      <span className={styles.profileStatLabel}>결석{selected.convertedAbsent > 0 ? ' (환산 포함)' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* 출석 로그 */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>📅 최근 출석 기록</h2>
                  {attendanceLogs.length === 0 ? (
                    <div className={styles.emptySmall}>출석 기록이 없습니다.</div>
                  ) : (
                    <div className={styles.attendanceGrid}>
                      {attendanceLogs.map(a => {
                        const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.PRESENT
                        const d = new Date(a.date + 'T00:00:00')
                        const label = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })
                        const excused = a.status === 'ABSENT' && a.schedule_id != null && excusedScheduleIds.has(a.schedule_id)
                        return (
                          <div key={a.id} className={styles.attChip}>
                            <span className={styles.attDate}>{label}</span>
                            <span
                              className={styles.attStatus}
                              style={{ background: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                            {excused && <span className={styles.excusedBadge}>인정</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 평가 작성 */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>✏️ 평가 등록</h2>
                  <form onSubmit={handleEvalSubmit} className={styles.evalForm}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={score}
                      onChange={e => setScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                      className={styles.select}
                      placeholder="점수 (100점 만점)"
                    />
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="오늘 수업 태도, 진도, 특이사항을 적어주세요."
                      className={styles.textarea}
                      required
                    />
                    <button type="submit" className={styles.submitBtn} disabled={submitting}>
                      {submitting ? '저장 중...' : '평가 등록'}
                    </button>
                  </form>
                </div>

                {/* 평가 이력 */}
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>📝 최근 평가 내역</h2>
                  {evalLogs.length === 0 ? (
                    <div className={styles.emptySmall}>아직 작성된 평가가 없습니다.</div>
                  ) : (
                    evalLogs.map(ev => (
                      <div key={ev.id} className={styles.evalItem}>
                        <div className={styles.evalTop}>
                          <span className={styles.evalScore}>{ev.score}점</span>
                          <span className={styles.evalDate}>{new Date(ev.created_at).toLocaleDateString('ko-KR')}</span>
                          <span className={styles.evalWriter}>{(ev.writer as any)?.name ?? ''} 선생님</span>
                        </div>
                        <p className={styles.evalComment}>{ev.comment}</p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
