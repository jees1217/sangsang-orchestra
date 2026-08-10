"use client";

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeAttendanceStats, excusedKey, absenceBreakdown, fetchCurrentTerm, scopeToTerm,
  fetchAllPages, PAGE_SIZE, rateColorByAbsence, type AttendanceStats, type TermWindow,
} from '@/lib/attendance'
import styles from './evaluations.module.css'

const STATUS_CONFIG = {
  PRESENT: { label: '출석', color: '#16a34a', bg: '#dcfce7' },
  LATE:    { label: '지각', color: '#d97706', bg: '#fef3c7' },
  ABSENT:  { label: '결석', color: '#dc2626', bg: '#fee2e2' },
}


interface Student {
  id: string
  name: string
  cohort: number | null
  instrument: string | null
  classes: { name: string } | null
  /** 진행 중인 기수 구간의 출결 집계 (기수 미설정이면 전 기간) */
  stats: AttendanceStats
}

interface AttendanceRecord {
  id: string
  date: string
  status: 'PRESENT' | 'LATE' | 'ABSENT'
  schedule_id: string | null
  teacher_id: string | null
}

interface Evaluation {
  id: string
  score: number
  comment: string
  created_at: string
  writer_id: string | null
  writer: { name: string }
}

export default function EvaluationsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([])
  const [excusedScheduleIds, setExcusedScheduleIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Evaluation[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [score, setScore] = useState<number>(100)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 평가 내역 수정
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null)
  const [editScore, setEditScore] = useState(100)
  const [editComment, setEditComment] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [tab, setTab] = useState<'byStudent' | 'session' | 'byTerm'>('byStudent')
  const [sessionSchedules, setSessionSchedules] = useState<any[]>([])
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [allStudentsForSession, setAllStudentsForSession] = useState<any[]>([])
  const [sessionStudents, setSessionStudents] = useState<{ id: string; name: string; className: string | null }[]>([])
  const [sessionData, setSessionData] = useState<Record<string, {
    status: 'PRESENT' | 'LATE' | 'ABSENT'; score: number; comment: string
    recordedBy: string | null; recordedAt: string | null
  }>>({})
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionSaving, setSessionSaving] = useState(false)

  // 학생 개인의 cohort(가입 기수)와 "교육 기수차"는 별개 개념이라 (예: 신입을 뽑지 않은 회차도 있음)
  // 진행 중인 기수차는 학생 데이터로 추측하지 않고 관리자가 직접 관리한다.
  const [currentTerm, setCurrentTerm] = useState<number | null>(null)
  const [termLoaded, setTermLoaded] = useState(false)
  // 출결 집계 구간 = 진행 중인 기수. null 이면 기수 미설정이라 전 기간으로 집계한다.
  const [termWindow, setTermWindow] = useState<TermWindow>(null)
  const [termInput, setTermInput] = useState('')
  const [endingTerm, setEndingTerm] = useState(false)

  // 기수별 조회
  const [termOptions, setTermOptions] = useState<{ term: number; started_at: string | null; closed_at: string | null }[]>([])
  const [selectedReportTerm, setSelectedReportTerm] = useState<number | ''>('')
  const [termReport, setTermReport] = useState<{
    id: string; name: string; cohort: number | null; instrument: string | null; className: string | null
    present: number; late: number; absent: number; excused: number
    convertedAbsent: number; effectiveAbsent: number; rate: number
    evalCount: number; avgScore: number | null
  }[]>([])
  const [termReportLoading, setTermReportLoading] = useState(false)

  // 옵저버(director)는 열람만 가능 — 쓰기/수정 권한 없음
  const canWrite = userRole === 'teacher' || userRole === 'admin'

  // 선택 학생의 기수 집계. 목록(fetchInitialData)의 값을 쓰되, 출결을 인라인으로 고치면
  // attendanceLogs 가 먼저 바뀌므로 그쪽에서 다시 파생시켜 즉시 반영되게 한다.
  const detailStats = useMemo<AttendanceStats>(() => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0 }
    attendanceLogs.forEach(a => {
      if (a.status === 'PRESENT') counts.present++
      else if (a.status === 'LATE') counts.late++
      else if (a.status === 'ABSENT') {
        if (a.schedule_id != null && excusedScheduleIds.has(a.schedule_id)) counts.excused++
        else counts.absent++
      }
    })
    return computeAttendanceStats(counts)
  }, [attendanceLogs, excusedScheduleIds])

  const termLabel = currentTerm !== null ? `${currentTerm}기` : '전 기간'

  // 학생 목록 정렬. 기준값이 같으면 항상 이름순(오름차순)으로 묶는다.
  const [sortBy, setSortBy] = useState<'cohort' | 'absence'>('cohort')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const sortedStudents = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...students].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'cohort') {
        // cohort 미배정 학생은 방향과 무관하게 항상 맨 뒤로 보낸다.
        if (a.cohort == null && b.cohort == null) cmp = 0
        else if (a.cohort == null) cmp = 1
        else if (b.cohort == null) cmp = -1
        else cmp = (a.cohort - b.cohort) * dir
      } else {
        cmp = (a.stats.effectiveAbsent - b.stats.effectiveAbsent) * dir
      }
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name, 'ko')
    })
  }, [students, sortBy, sortDir])

  const supabase = createClient()

  useEffect(() => { fetchInitialData() }, [])
  useEffect(() => { if (selectedStudent) loadDetail(selectedStudent.id) }, [selectedStudent])
  useEffect(() => { if (tab === 'session') fetchSessionSchedules() }, [tab])
  useEffect(() => { if (selectedScheduleId) loadSession(selectedScheduleId) }, [selectedScheduleId])
  useEffect(() => { if (tab === 'byTerm' && termOptions.length === 0) fetchTermOptions() }, [tab])
  useEffect(() => { if (selectedReportTerm !== '') loadTermReport(selectedReportTerm) }, [selectedReportTerm])

  const handleSetTerm = async () => {
    const n = Number(termInput)
    if (!Number.isInteger(n) || n < 1) return alert('올바른 기수차 숫자를 입력해주세요.')
    try {
      const { error } = await supabase.from('attendance_terms')
        .upsert({ term: n, started_at: null, closed_at: null }, { onConflict: 'term' })
      if (error) throw error
      setTermInput('')
      // 집계 구간이 바뀌었으므로 출결 수치를 다시 계산한다.
      await fetchInitialData()
    } catch (error) {
      console.error('기수차 설정 실패:', error)
      alert('기수차 설정 중 오류가 발생했습니다.')
    }
  }

  const handleEndTerm = async () => {
    if (currentTerm === null) return
    if (!window.confirm(
      `${currentTerm}기 출결을 지금 시점으로 마감하고 ${currentTerm + 1}기 출결을 새로 시작합니다.\n` +
      `마감된 ${currentTerm}기의 출결 값은 이후 최종값으로 고정됩니다. 계속할까요?`
    )) return

    setEndingTerm(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()

      const { error: closeErr } = await supabase.from('attendance_terms')
        .upsert({ term: currentTerm, closed_at: now, closed_by: user?.id }, { onConflict: 'term' })
      if (closeErr) throw closeErr

      const { error: startErr } = await supabase.from('attendance_terms')
        .upsert({ term: currentTerm + 1, started_at: now, closed_at: null }, { onConflict: 'term' })
      if (startErr) throw startErr

      alert(`${currentTerm}기 출결이 마감되고 ${currentTerm + 1}기가 시작되었습니다.`)
      // 새 기수로 집계 구간이 바뀌므로 출결 수치를 다시 계산한다.
      setTermOptions([])
      await fetchInitialData()
    } catch (error) {
      console.error('기수 마감 실패:', error)
      alert('기수 마감 중 오류가 발생했습니다.')
    } finally {
      setEndingTerm(false)
    }
  }

  const fetchTermOptions = async () => {
    try {
      const { data } = await supabase
        .from('attendance_terms').select('term, started_at, closed_at').order('term', { ascending: false })
      setTermOptions((data as any) || [])
    } catch (error) {
      console.error('기수차 목록 로딩 실패:', error)
    }
  }

  const loadTermReport = async (term: number) => {
    setTermReportLoading(true)
    try {
      const row = termOptions.find(t => t.term === term)
      const ids = students.map(s => s.id)
      if (!row || ids.length === 0) { setTermReport([]); return }

      const fromDate = row.started_at ? row.started_at.split('T')[0] : null
      const toDate   = row.closed_at ? row.closed_at.split('T')[0] : null

      let attQuery = supabase.from('attendances').select('student_id, status, schedule_id').in('student_id', ids)
      if (fromDate) attQuery = attQuery.gte('date', fromDate)
      if (toDate)   attQuery = attQuery.lte('date', toDate)

      let evalQuery = supabase.from('evaluations').select('student_id, score, created_at').in('student_id', ids)
      if (row.started_at) evalQuery = evalQuery.gte('created_at', row.started_at)
      if (row.closed_at)  evalQuery = evalQuery.lte('created_at', row.closed_at)

      const subQuery = supabase.from('attendance_substitutions')
        .select('student_id, schedule_id').in('student_id', ids).eq('status', 'approved')

      const [{ data: attData }, { data: evalData }, { data: subData }] =
        await Promise.all([attQuery, evalQuery, subQuery])

      const excused = new Set((subData || []).map((s: any) => excusedKey(s.student_id, s.schedule_id)))

      const attMap: Record<string, { present: number; late: number; absent: number; excused: number }> = {}
      ;(attData || []).forEach((a: any) => {
        if (!attMap[a.student_id]) attMap[a.student_id] = { present: 0, late: 0, absent: 0, excused: 0 }
        if (a.status === 'PRESENT') attMap[a.student_id].present++
        else if (a.status === 'LATE') attMap[a.student_id].late++
        else if (a.status === 'ABSENT') {
          // 출석 대체가 승인된 결석은 '인정'으로 빼고 결석/모수에서 제외한다.
          if (a.schedule_id != null && excused.has(excusedKey(a.student_id, a.schedule_id))) attMap[a.student_id].excused++
          else attMap[a.student_id].absent++
        }
      })

      const evalMap: Record<string, { sum: number; count: number }> = {}
      ;(evalData || []).forEach((e: any) => {
        if (e.score == null) return
        if (!evalMap[e.student_id]) evalMap[e.student_id] = { sum: 0, count: 0 }
        evalMap[e.student_id].sum += e.score
        evalMap[e.student_id].count++
      })

      const report = students.map(s => {
        const c = attMap[s.id] || { present: 0, late: 0, absent: 0, excused: 0 }
        // 지각 3회 = 결석 1회로 환산해 해당 기수 출석률을 계산한다.
        const stats = computeAttendanceStats(c)
        const ev = evalMap[s.id]
        return {
          id: s.id, name: s.name, cohort: s.cohort, instrument: s.instrument, className: s.classes?.name ?? null,
          present: c.present, late: c.late, absent: c.absent, excused: c.excused,
          convertedAbsent: stats.convertedAbsent, effectiveAbsent: stats.effectiveAbsent,
          rate: stats.rate,
          evalCount: ev?.count ?? 0,
          avgScore: ev && ev.count > 0 ? Math.round((ev.sum / ev.count) * 10) / 10 : null,
        }
      }).sort((a, b) => a.rate - b.rate)
      setTermReport(report)
    } catch (error) {
      console.error('기수별 출결/평가 조회 실패:', error)
    } finally {
      setTermReportLoading(false)
    }
  }

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users').select('role, name').eq('id', user.id).single()
      if (!userData) return

      setCurrentUser({ id: user.id, name: userData.name })
      setUserRole(userData.role)

      // 담당 학생 ID 범위 결정 (선생님은 본인 반 학생만)
      let classIds: string[] | null = null
      if (userData.role === 'teacher') {
        const { data: myClasses } = await supabase
          .from('classes').select('id').filter('teacher_ids', 'cs', `{${user.id}}`)
        if (!myClasses || myClasses.length === 0) {
          setStudents([]); setLoading(false); return
        }
        classIds = myClasses.map(c => c.id)
      }

      // 학생 목록
      let q = supabase
        .from('users')
        .select('id, name, cohort, instrument, classes:class_id(name)')
        .eq('role', 'student').eq('is_active', true).order('name')
      if (classIds) q = q.in('class_id', classIds)
      const { data: studentsData } = await q

      // 집계 구간 = 진행 중인 기수 (미설정이면 전 기간)
      const openRow = await fetchCurrentTerm(supabase)
      setCurrentTerm(openRow ? openRow.term : null)
      setTermWindow(openRow)
      setTermLoaded(true)

      const allIds = (studentsData || []).map((s: any) => s.id)

      const emptyCounts = () => ({ present: 0, late: 0, absent: 0, excused: 0 })
      type Counts = ReturnType<typeof emptyCounts>
      const attMap: Record<string, Counts> = {}
      if (allIds.length > 0) {
        const [attRows, subRows] = await Promise.all([
          fetchAllPages(from => scopeToTerm(supabase.from('attendances')
            .select('student_id, status, schedule_id, date')
            .in('student_id', allIds), openRow).order('id').range(from, from + PAGE_SIZE - 1)),
          fetchAllPages(from => supabase.from('attendance_substitutions')
            .select('student_id, schedule_id')
            .in('student_id', allIds).eq('status', 'approved').order('id').range(from, from + PAGE_SIZE - 1)),
        ])
        const excused = new Set(subRows.map((s: any) => excusedKey(s.student_id, s.schedule_id)))
        attRows.forEach((a: any) => {
          if (!attMap[a.student_id]) attMap[a.student_id] = emptyCounts()
          const c = attMap[a.student_id]
          if (a.status === 'PRESENT') c.present++
          else if (a.status === 'LATE') c.late++
          else if (a.status === 'ABSENT') {
            // 출석 대체가 승인된 결석은 '인정'으로 빼고 결석/모수에서 제외한다.
            if (a.schedule_id != null && excused.has(excusedKey(a.student_id, a.schedule_id))) c.excused++
            else c.absent++
          }
        })
      }

      const list: Student[] = (studentsData || []).map((u: any) => {
        // 지각 3회 = 결석 1회로 환산해 해당 기수 출석률을 계산한다.
        const stats = computeAttendanceStats(attMap[u.id] || emptyCounts())
        return {
          id: u.id, name: u.name, cohort: u.cohort, instrument: u.instrument,
          classes: u.classes,
          stats,
        }
      })
      setStudents(list)
    } catch (error) {
      console.error('데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (studentId: string) => {
    setDetailLoading(true)
    try {
      const [{ data: attData }, { data: evalData }, { data: subData }] = await Promise.all([
        // 기수 구간 전체를 받아 누적 집계를 내고, 칩 목록은 최근 20회만 렌더한다.
        scopeToTerm(supabase.from('attendances')
          .select('id, date, status, schedule_id, teacher_id').eq('student_id', studentId), termWindow)
          .order('date', { ascending: false }),
        supabase.from('evaluations')
          .select('id, score, comment, created_at, writer_id, writer:writer_id(name)')
          .eq('student_id', studentId).order('created_at', { ascending: false }),
        supabase.from('attendance_substitutions')
          .select('schedule_id').eq('student_id', studentId).eq('status', 'approved'),
      ])
      setAttendanceLogs((attData as any) || [])
      setExcusedScheduleIds(new Set((subData || []).map((s: any) => s.schedule_id)))
      setHistory((evalData as any) || [])
    } finally {
      setDetailLoading(false)
    }
  }

  // 본인(작성자)이거나 admin이면 수정·삭제 가능. teacher는 본인이 기록한 건만. 옵저버(director)는 불가.
  const canEditAttendance = (a: AttendanceRecord) =>
    userRole === 'admin' || (userRole === 'teacher' && a.teacher_id === currentUser?.id)
  const canEditEval = (e: Evaluation) =>
    userRole === 'admin' || (userRole === 'teacher' && e.writer_id === currentUser?.id)

  const handleAttendanceStatusChange = async (attId: string, newStatus: 'PRESENT' | 'LATE' | 'ABSENT') => {
    try {
      const { error } = await supabase.from('attendances').update({ status: newStatus }).eq('id', attId)
      if (error) throw error
      setAttendanceLogs(prev => prev.map(a => a.id === attId ? { ...a, status: newStatus } : a))
      if (selectedStudent) fetchInitialData()
    } catch (error) {
      console.error('출결 수정 실패:', error)
      alert('출결 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDeleteAttendance = async (attId: string) => {
    if (!window.confirm('이 출결 기록을 삭제할까요?')) return
    try {
      const { error } = await supabase.from('attendances').delete().eq('id', attId)
      if (error) throw error
      setAttendanceLogs(prev => prev.filter(a => a.id !== attId))
      if (selectedStudent) fetchInitialData()
    } catch (error) {
      console.error('출결 삭제 실패:', error)
      alert('출결 삭제 중 오류가 발생했습니다.')
    }
  }

  const startEditEval = (item: Evaluation) => {
    setEditingEvalId(item.id)
    setEditScore(item.score)
    setEditComment(item.comment === '코멘트 없음' ? '' : item.comment)
  }

  const cancelEditEval = () => {
    setEditingEvalId(null)
  }

  const saveEditEval = async (id: string) => {
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('evaluations')
        .update({ score: editScore, comment: editComment.trim() || '코멘트 없음' }).eq('id', id)
      if (error) throw error
      setEditingEvalId(null)
      if (selectedStudent) loadDetail(selectedStudent.id)
    } catch (error) {
      console.error('평가 수정 실패:', error)
      alert('평가 수정 중 오류가 발생했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteEval = async (id: string) => {
    if (!window.confirm('이 평가 내역을 삭제할까요?')) return
    try {
      const { error } = await supabase.from('evaluations').delete().eq('id', id)
      if (error) throw error
      setHistory(prev => prev.filter(h => h.id !== id))
    } catch (error) {
      console.error('평가 삭제 실패:', error)
      alert('평가 삭제 중 오류가 발생했습니다.')
    }
  }

  const fetchSessionSchedules = async () => {
    setSessionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const todayStr = new Date().toISOString().split('T')[0]

      let query = supabase
        .from('schedules')
        .select('id, title, schedule_type, schedule_date, start_time, target_type, target_cohort, target_class_id, target_user_id')
        .lte('schedule_date', todayStr)
        .order('schedule_date', { ascending: false })
        .order('start_time', { ascending: false })

      if (userRole === 'teacher') {
        const { data: myClasses } = await supabase
          .from('classes').select('id').filter('teacher_ids', 'cs', `{${user.id}}`)
        const classIds = (myClasses || []).map((c: any) => c.id)
        const filter = classIds.length > 0
          ? `teacher_id.eq.${user.id},target_class_id.in.(${classIds.join(',')})`
          : `teacher_id.eq.${user.id}`
        query = query.or(filter)
      }

      const { data } = await query
      setSessionSchedules(data || [])

      // 대상 학생 판별용 전체 학생 목록 (한 번만 로드)
      if (allStudentsForSession.length === 0) {
        const { data: allStudents } = await supabase
          .from('users')
          .select('id, name, cohort, class_id, classes:class_id(name)')
          .eq('role', 'student').eq('is_active', true).order('name')
        setAllStudentsForSession(allStudents || [])
      }
    } finally {
      setSessionLoading(false)
    }
  }

  const resolveSessionStudents = (schedule: any, allStudents: any[]) => {
    switch (schedule.target_type) {
      case 'all':
        return allStudents
      case 'cohort':
        return allStudents.filter(s => (schedule.target_cohort || []).includes(s.cohort))
      case 'class':
        return allStudents.filter(s => s.class_id === schedule.target_class_id)
      case 'individual':
        return allStudents.filter(s => s.id === schedule.target_user_id)
      default:
        return []
    }
  }

  const loadSession = async (scheduleId: string) => {
    setSessionLoading(true)
    try {
      const schedule = sessionSchedules.find(sc => sc.id === scheduleId)
      if (!schedule) return

      let allStudents = allStudentsForSession
      if (allStudents.length === 0) {
        const { data } = await supabase
          .from('users')
          .select('id, name, cohort, class_id, classes:class_id(name)')
          .eq('role', 'student').eq('is_active', true).order('name')
        allStudents = data || []
        setAllStudentsForSession(allStudents)
      }

      const resolved = resolveSessionStudents(schedule, allStudents)
      const resolvedStudents = resolved.map((s: any) => ({ id: s.id, name: s.name, className: s.classes?.name || null }))
      setSessionStudents(resolvedStudents)

      const ids = resolvedStudents.map(s => s.id)
      const [{ data: attData }, { data: evalData }] = ids.length > 0 ? await Promise.all([
        supabase.from('attendances').select('student_id, status, created_at, teacher:teacher_id(name)').eq('schedule_id', scheduleId).in('student_id', ids),
        supabase.from('evaluations').select('student_id, score, comment, created_at, writer:writer_id(name)').eq('schedule_id', scheduleId).in('student_id', ids),
      ]) : [{ data: [] }, { data: [] }]

      const map: Record<string, { status: 'PRESENT' | 'LATE' | 'ABSENT'; score: number; comment: string; recordedBy: string | null; recordedAt: string | null }> = {}
      resolvedStudents.forEach(s => { map[s.id] = { status: 'PRESENT', score: 100, comment: '', recordedBy: null, recordedAt: null } })
      ;(attData || []).forEach((a: any) => {
        if (!map[a.student_id]) return
        map[a.student_id].status = a.status
        map[a.student_id].recordedBy = a.teacher?.name || null
        map[a.student_id].recordedAt = a.created_at
      })
      ;(evalData || []).forEach((e: any) => {
        if (!map[e.student_id]) return
        map[e.student_id].score = e.score
        map[e.student_id].comment = e.comment === '코멘트 없음' ? '' : e.comment
        // 평가 작성자를 우선 표시 (출석·평가는 항상 같은 사람이 함께 저장하므로 보통 동일인)
        map[e.student_id].recordedBy = e.writer?.name || map[e.student_id].recordedBy
        map[e.student_id].recordedAt = e.created_at
      })
      setSessionData(map)
    } finally {
      setSessionLoading(false)
    }
  }

  const handleSessionSave = async () => {
    if (!currentUser || !selectedScheduleId) return
    setSessionSaving(true)
    try {
      const schedule = sessionSchedules.find(sc => sc.id === selectedScheduleId)
      const attendanceRows = sessionStudents.map(s => ({
        student_id: s.id,
        teacher_id: currentUser.id,
        schedule_id: selectedScheduleId,
        date: schedule?.schedule_date,
        status: sessionData[s.id]?.status || 'PRESENT',
      }))
      const evalRows = sessionStudents.map(s => ({
        student_id: s.id,
        writer_id: currentUser.id,
        schedule_id: selectedScheduleId,
        score: sessionData[s.id]?.score ?? 100,
        comment: (sessionData[s.id]?.comment || '').trim() || '코멘트 없음',
      }))

      const [{ error: attErr }, { error: evalErr }] = await Promise.all([
        supabase.from('attendances').upsert(attendanceRows, { onConflict: 'student_id,schedule_id' }),
        supabase.from('evaluations').upsert(evalRows, { onConflict: 'student_id,schedule_id' }),
      ])
      if (attErr) throw attErr
      if (evalErr) throw evalErr
      alert('출결·평가가 저장되었습니다.')
      if (selectedStudent) loadDetail(selectedStudent.id)
    } catch (error) {
      console.error('수업별 출결·평가 저장 실패:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSessionSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudent || !currentUser) return
    setIsSubmitting(true)
    try {
      const { error } = await supabase.from('evaluations').insert({
        student_id: selectedStudent.id, writer_id: currentUser.id,
        score, comment: comment.trim() || '코멘트 없음',
      })
      if (error) throw error
      alert('평가가 성공적으로 등록되었습니다.')
      setScore(100); setComment('')
      loadDetail(selectedStudent.id)
    } catch (error) {
      console.error('평가 등록 실패:', error)
      alert('평가 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDownloadCSV = async () => {
    try {
      const { data, error } = await supabase.from('evaluations')
        .select('score, comment, created_at, student:student_id(name), writer:writer_id(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      if (!data || data.length === 0) return alert('다운로드할 데이터가 없습니다.')
      let csv = '작성일시,학생 이름,수업 점수(100점 만점),평가자(선생님),코멘트/특이사항\n'
      data.forEach((row: any) => {
        const date = new Date(row.created_at).toLocaleDateString()
        const safeComment = `"${(row.comment || '').replace(/"/g, '""')}"`
        csv += `${date},${row.student?.name || '알 수 없음'},${row.score}점,${row.writer?.name || '알 수 없음'},${safeComment}\n`
      })
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `강의평가_전체내역_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
    } catch (error) {
      console.error('CSV 다운로드 실패:', error)
      alert('다운로드 중 오류가 발생했습니다.')
    }
  }

  if (loading) return <div className={styles.loading}>데이터를 불러오는 중입니다...</div>
  if (userRole === 'student') return <div className={styles.empty}>접근 권한이 없습니다.</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{canWrite ? '출결 / 평가 관리' : '출결 / 평가 현황'}</h1>
          <p className={styles.subtitle}>학생 {students.length}명 · {termLabel} 출석 기준</p>
        </div>
        {userRole === 'admin' && (
          <button onClick={handleDownloadCSV} className={styles.csvBtn}>
            ⬇ 전체 평가 내역 (CSV)
          </button>
        )}
      </div>

      {userRole === 'admin' && termLoaded && (
        currentTerm !== null ? (
          <div className={styles.cohortBar}>
            <span className={styles.cohortLabel}>현재 <strong>{currentTerm}기</strong> 진행 중</span>
            <button onClick={handleEndTerm} disabled={endingTerm} className={styles.cohortEndBtn}>
              {endingTerm ? '처리 중...' : `출결 체크 종료 (${currentTerm}기 마감 → ${currentTerm + 1}기 시작)`}
            </button>
          </div>
        ) : (
          <div className={styles.cohortBar}>
            <span className={styles.cohortLabel}>진행 중인 기수차가 설정되지 않았습니다.</span>
            <input
              type="number"
              min={1}
              value={termInput}
              onChange={e => setTermInput(e.target.value)}
              placeholder="예: 4"
              className={styles.termInput}
            />
            <button onClick={handleSetTerm} className={styles.cohortEndBtn}>현재 기수차 설정</button>
          </div>
        )
      )}

      {canWrite && (
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${tab === 'byStudent' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('byStudent')}
          >
            학생별 조회
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'session' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('session')}
          >
            🗓 수업별 출결·평가
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'byTerm' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('byTerm')}
          >
            📊 기수별 조회
          </button>
        </div>
      )}

      {tab === 'session' && canWrite ? (
        <div className={styles.card}>
          <div className={styles.rosterHeader}>
            <h2 className={styles.sectionTitle} style={{ border: 'none', margin: 0, padding: 0 }}>수업 선택</h2>
            <select
              className={styles.select}
              style={{ width: 'auto', minWidth: 280 }}
              value={selectedScheduleId}
              onChange={e => setSelectedScheduleId(e.target.value)}
            >
              <option value="">지난 수업을 선택하세요</option>
              {sessionSchedules.map(sc => {
                const dateLabel = new Date(sc.schedule_date + 'T00:00:00').toLocaleDateString('ko-KR', {
                  month: 'numeric', day: 'numeric', weekday: 'short',
                })
                return (
                  <option key={sc.id} value={sc.id}>
                    {dateLabel} {sc.start_time?.substring(0, 5)} · {sc.title}
                  </option>
                )
              })}
            </select>
          </div>

          {!selectedScheduleId ? (
            <div className={styles.empty}>{sessionLoading ? '불러오는 중...' : '기록할 수업을 선택해주세요.'}</div>
          ) : sessionLoading ? (
            <div className={styles.loading}>불러오는 중...</div>
          ) : sessionStudents.length === 0 ? (
            <div className={styles.empty}>이 수업에 해당하는 학생이 없습니다.</div>
          ) : (
            <>
              {sessionStudents.map(s => {
                const data = sessionData[s.id] || { status: 'PRESENT', score: 100, comment: '', recordedBy: null, recordedAt: null }
                const updateSession = (patch: Partial<typeof data>) => setSessionData(prev => ({
                  ...prev,
                  [s.id]: { ...(prev[s.id] || { status: 'PRESENT', score: 100, comment: '', recordedBy: null, recordedAt: null }), ...patch },
                }))
                return (
                  <div key={s.id} className={styles.sessionRow}>
                    <div className={styles.rosterRow} style={{ borderBottom: 'none', paddingBottom: 6 }}>
                      <div className={styles.rosterName}>
                        {s.name}
                        {s.className && <span className={styles.className} style={{ marginLeft: 8 }}>{s.className}</span>}
                        {data.recordedBy ? (
                          <span className={styles.recordedBadge}>
                            ✓ {data.recordedBy} 선생님 기록 · {new Date(data.recordedAt!).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className={styles.unrecordedBadge}>미기록</span>
                        )}
                      </div>
                      <div className={styles.rosterBtns}>
                        {(['PRESENT', 'LATE', 'ABSENT'] as const).map(st => {
                          const cfg = STATUS_CONFIG[st]
                          const active = data.status === st
                          return (
                            <button
                              key={st}
                              type="button"
                              className={styles.statusBtn}
                              style={active ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color } : undefined}
                              onClick={() => updateSession({ status: st, ...(st === 'ABSENT' ? { score: 0 } : {}) })}
                            >
                              {cfg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className={styles.sessionEvalRow}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className={styles.sessionScoreSelect}
                        value={data.score}
                        onChange={e => updateSession({ score: Math.max(0, Math.min(100, Number(e.target.value))) })}
                      />
                      <span className={styles.scoreUnit}>점</span>
                      <input
                        type="text"
                        className={styles.sessionCommentInput}
                        placeholder="코멘트 (선택 입력)"
                        value={data.comment}
                        onChange={e => updateSession({ comment: e.target.value })}
                      />
                    </div>
                  </div>
                )
              })}
              <button onClick={handleSessionSave} className={styles.submitBtn} disabled={sessionSaving} style={{ marginTop: 16 }}>
                {sessionSaving ? '저장 중...' : '출결·평가 저장하기'}
              </button>
            </>
          )}
        </div>
      ) : tab === 'byTerm' && canWrite ? (
        <div className={styles.card}>
          <div className={styles.rosterHeader}>
            <h2 className={styles.sectionTitle} style={{ border: 'none', margin: 0, padding: 0 }}>기수 선택</h2>
            <select
              className={styles.select}
              style={{ width: 'auto', minWidth: 240 }}
              value={selectedReportTerm}
              onChange={e => setSelectedReportTerm(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">기수를 선택하세요</option>
              {termOptions.map(t => (
                <option key={t.term} value={t.term}>
                  {t.term}기 {t.closed_at ? `(마감: ${new Date(t.closed_at).toLocaleDateString('ko-KR')})` : '(진행 중)'}
                </option>
              ))}
            </select>
          </div>

          {termOptions.length === 0 ? (
            <div className={styles.empty}>아직 설정된 기수차가 없습니다. 관리자가 출결/평가 관리에서 기수차를 먼저 설정해주세요.</div>
          ) : selectedReportTerm === '' ? (
            <div className={styles.empty}>조회할 기수를 선택해주세요.</div>
          ) : termReportLoading ? (
            <div className={styles.loading}>불러오는 중...</div>
          ) : termReport.length === 0 ? (
            <div className={styles.empty}>해당 기수에 학생이 없습니다.</div>
          ) : (
            <table className={styles.termTable}>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>반</th>
                  <th>출석</th>
                  <th>지각</th>
                  <th>인정</th>
                  <th>결석<span className={styles.sectionSub} style={{ marginLeft: 4 }}>(환산 포함)</span></th>
                  <th>출석률</th>
                  <th>평가 건수</th>
                  <th>평균 점수</th>
                </tr>
              </thead>
              <tbody>
                {termReport.map(r => {
                  const rateColor = rateColorByAbsence(r.effectiveAbsent)
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        {r.cohort && <span className={styles.tag} style={{ marginLeft: 6 }}>{r.cohort}기</span>}
                      </td>
                      <td>{r.className || '-'}</td>
                      <td>{r.present}</td>
                      <td>{r.late}</td>
                      <td style={r.excused > 0 ? { color: '#2563eb', fontWeight: 700 } : undefined}>
                        {r.excused > 0 ? `-${r.excused}` : '-'}
                      </td>
                      <td title={absenceBreakdown(r) ?? undefined}>
                        {r.effectiveAbsent}
                        {(r.convertedAbsent > 0 || r.excused > 0) && (
                          <span className={styles.sectionSub} style={{ marginLeft: 4 }}>
                            (기록 {r.absent + r.excused}
                            {r.excused > 0 && ` − 인정 ${r.excused}`}
                            {r.convertedAbsent > 0 && ` + 지각환산 ${r.convertedAbsent}`})
                          </span>
                        )}
                      </td>
                      <td style={{ color: rateColor, fontWeight: 700 }}>{r.rate}%</td>
                      <td>{r.evalCount}건</td>
                      <td>{r.avgScore !== null ? `${r.avgScore}점` : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
      <div className={styles.layout}>
        {/* ── 학생 목록: 미선택 시 전체 폭 카드 그리드, 선택 시 왼쪽 좁은 목록 ── */}
        <div className={`${styles.studentList} ${selectedStudent ? '' : styles.studentListFull}`}>
          <div className={styles.listHeader}>
            <div className={styles.listHeaderTitle}>학생 목록 ({students.length}명) · {termLabel} 기준</div>
            <div className={styles.sortControls}>
              <select
                className={styles.sortSelect}
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'cohort' | 'absence')}
              >
                <option value="cohort">기수순</option>
                <option value="absence">결석순</option>
              </select>
              <button
                type="button"
                className={styles.sortDirBtn}
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              >
                {sortDir === 'asc' ? '오름차순 ▲' : '내림차순 ▼'}
              </button>
            </div>
          </div>
          {students.length === 0 ? (
            <div className={styles.empty} style={{ padding: '20px' }}>담당 학생이 없습니다.</div>
          ) : (
            <div className={selectedStudent ? styles.studentRows : styles.studentGrid}>
              {sortedStudents.map(s => {
                const rateColor = rateColorByAbsence(s.stats.effectiveAbsent)
                return (
                  <div
                    key={s.id}
                    className={`${styles.studentItem} ${selectedStudent?.id === s.id ? styles.studentItemActive : ''}`}
                    onClick={() => setSelectedStudent(s)}
                  >
                    <div className={styles.studentItemMain}>
                      <div className={styles.studentName}>{s.name}</div>
                      <div className={styles.studentTags}>
                        {s.instrument && <span className={styles.tag}>{s.instrument}</span>}
                        {s.cohort && <span className={styles.tag}>{s.cohort}기</span>}
                      </div>
                      <div className={styles.className}>{s.classes?.name || '소속 반 없음'}</div>
                      <div
                        className={styles.cumulativeInline}
                        title={`${termLabel} 누적 · ${absenceBreakdown(s.stats) ?? `결석 ${s.stats.effectiveAbsent}회`}`}
                      >
                        <span style={{ color: '#16a34a' }}>출석 {s.stats.present}</span>
                        <span style={{ color: '#d97706' }}>지각 {s.stats.late}</span>
                        {s.stats.excused > 0 && <span style={{ color: '#2563eb' }}>인정 -{s.stats.excused}</span>}
                        <span style={{ color: '#dc2626' }}>결석 {s.stats.effectiveAbsent}</span>
                      </div>
                    </div>
                    <div className={styles.rateWrap}>
                      <span className={styles.rateNum} style={{ color: rateColor }}>{s.stats.rate}%</span>
                      <span className={styles.rateLabel}>출석률</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 오른쪽: 상세 패널 (학생 선택 시에만) ── */}
        {selectedStudent && (
        <div className={styles.mainContent}>
          <button
            type="button"
            className={styles.backToListBtn}
            onClick={() => setSelectedStudent(null)}
          >
            ← 전체 학생 목록으로 돌아가기
          </button>
          {detailLoading ? (
            <div className={styles.loading}>정보를 불러오는 중...</div>
          ) : (
            <>
              {/* 프로필 헤더 */}
              <div className={styles.profileHeader}>
                <div className={styles.profileAvatar}>{selectedStudent.name.charAt(0)}</div>
                <div className={styles.profileInfo}>
                  <div className={styles.profileName}>{selectedStudent.name}</div>
                  <div className={styles.profileTags}>
                    {selectedStudent.instrument && <span className={styles.profileTag}>{selectedStudent.instrument}</span>}
                    {selectedStudent.cohort && <span className={styles.profileTag}>{selectedStudent.cohort}기</span>}
                    {selectedStudent.classes?.name && <span className={styles.profileTag}>{selectedStudent.classes.name}</span>}
                  </div>
                </div>
                <div className={styles.profileStatsWrap}>
                <div className={styles.profileStatsCaption}>{termLabel} 누적</div>
                <div className={styles.profileStats}>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum} style={{ color: '#16a34a' }}>{detailStats.present}</span>
                    <span className={styles.profileStatLabel}>출석</span>
                  </div>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum} style={{ color: '#d97706' }}>{detailStats.late}</span>
                    <span className={styles.profileStatLabel}>지각</span>
                  </div>
                  {detailStats.excused > 0 && (
                    <div className={styles.profileStat} title="출석 대체가 승인되어 결석에서 차감된 횟수">
                      <span className={styles.profileStatNum} style={{ color: '#2563eb' }}>-{detailStats.excused}</span>
                      <span className={styles.profileStatLabel}>인정</span>
                    </div>
                  )}
                  <div className={styles.profileStat} title={absenceBreakdown(detailStats) ?? undefined}>
                    <span className={styles.profileStatNum} style={{ color: '#dc2626' }}>
                      {detailStats.effectiveAbsent}
                      {detailStats.convertedAbsent > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}> (+{detailStats.convertedAbsent})</span>
                      )}
                    </span>
                    <span className={styles.profileStatLabel}>결석{detailStats.convertedAbsent > 0 ? ' (환산 포함)' : ''}</span>
                  </div>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum} style={{ color: rateColorByAbsence(detailStats.effectiveAbsent) }}>
                      {detailStats.rate}%
                    </span>
                    <span className={styles.profileStatLabel}>출석률</span>
                  </div>
                </div>
                </div>
              </div>

              {/* ── 출결 현황 섹션 ── */}
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>
                  📅 출결 현황 <span className={styles.sectionSub}>{termLabel} {attendanceLogs.length}회 · 최근 20회 표시</span>
                </h2>
                {attendanceLogs.length === 0 ? (
                  <div className={styles.emptySmall}>출석 기록이 없습니다.</div>
                ) : (
                  <div className={styles.attendanceGrid}>
                    {attendanceLogs.slice(0, 20).map(a => {
                      const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.PRESENT
                      const label = new Date(a.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })
                      const excused = a.status === 'ABSENT' && a.schedule_id != null && excusedScheduleIds.has(a.schedule_id)
                      const editable = canEditAttendance(a)
                      return (
                        <div key={a.id} className={styles.attChip}>
                          <span className={styles.attDate}>{label}</span>
                          {editable ? (
                            <select
                              className={styles.attStatusSelect}
                              value={a.status}
                              style={{ background: cfg.bg, color: cfg.color }}
                              onChange={e => handleAttendanceStatusChange(a.id, e.target.value as 'PRESENT' | 'LATE' | 'ABSENT')}
                            >
                              <option value="PRESENT">출석</option>
                              <option value="LATE">지각</option>
                              <option value="ABSENT">결석</option>
                            </select>
                          ) : (
                            <span className={styles.attStatus} style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                          )}
                          {excused && <span className={styles.excusedBadge}>인정</span>}
                          {editable && (
                            <button type="button" className={styles.attDeleteBtn} onClick={() => handleDeleteAttendance(a.id)}>삭제</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── 평가 등록 섹션 (옵저버는 열람만) ── */}
              {canWrite && (
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>✏️ 평가 등록</h2>
                <form onSubmit={handleSubmit}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>수업 점수 (100점 만점)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={score}
                      onChange={e => setScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                      className={styles.select}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>수업 태도 및 특이사항</label>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="오늘 수업에서의 태도, 진도, 칭찬할 점이나 보완할 점을 자유롭게 적어주세요. (선택 입력)"
                      className={styles.textarea}
                    />
                  </div>
                  <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                    {isSubmitting ? '등록 중...' : '평가 등록하기'}
                  </button>
                </form>
              </div>
              )}

              {/* ── 평가 내역 섹션 ── */}
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>📝 평가 내역 <span className={styles.sectionSub}>{history.length}건</span></h2>
                {history.length === 0 ? (
                  <div className={styles.emptySmall}>아직 등록된 평가 내역이 없습니다.</div>
                ) : history.map(item => (
                  <div key={item.id} className={styles.historyItem}>
                    {editingEvalId === item.id ? (
                      <div className={styles.historyEditForm}>
                        <div className={styles.historyEditRow}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editScore}
                            onChange={e => setEditScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                            className={styles.sessionScoreSelect}
                          />
                          <span className={styles.scoreUnit}>점</span>
                        </div>
                        <textarea
                          value={editComment}
                          onChange={e => setEditComment(e.target.value)}
                          className={styles.textarea}
                          style={{ minHeight: 60 }}
                        />
                        <div className={styles.historyEditActions}>
                          <button type="button" onClick={cancelEditEval} className={styles.historyCancelBtn}>취소</button>
                          <button
                            type="button"
                            onClick={() => saveEditEval(item.id)}
                            disabled={savingEdit}
                            className={styles.historySaveBtn}
                          >
                            {savingEdit ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.historyHeader}>
                          <span className={styles.historyScore}>{item.score}점</span>
                          <span className={styles.historyDate}>{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                          <span className={styles.historyWriter}>{(item.writer as any)?.name || '알 수 없음'} 선생님</span>
                          {canEditEval(item) && (
                            <span className={styles.historyActions}>
                              <button type="button" onClick={() => startEditEval(item)} className={styles.historyEditBtn}>수정</button>
                              <button type="button" onClick={() => deleteEval(item.id)} className={styles.historyDeleteBtn}>삭제</button>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#2d3748' }}>{item.comment}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        )}
      </div>
      )}
    </div>
  )
}
