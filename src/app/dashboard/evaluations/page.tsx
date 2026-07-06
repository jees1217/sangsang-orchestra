"use client";

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  presentCount: number
  lateCount: number
  absentCount: number
  attendanceRate: number
}

interface AttendanceRecord {
  id: string
  date: string
  status: 'PRESENT' | 'LATE' | 'ABSENT'
}

interface Evaluation {
  id: string
  score: number
  comment: string
  created_at: string
  writer: { name: string }
}

export default function EvaluationsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([])
  const [history, setHistory] = useState<Evaluation[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [score, setScore] = useState<number>(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [tab, setTab] = useState<'byStudent' | 'roster'>('byStudent')
  const [rosterDate, setRosterDate] = useState(() => new Date().toISOString().split('T')[0])
  const [rosterStatuses, setRosterStatuses] = useState<Record<string, 'PRESENT' | 'LATE' | 'ABSENT'>>({})
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterSaving, setRosterSaving] = useState(false)

  const canWrite = userRole === 'teacher' || userRole === 'admin'

  const supabase = createClient()

  useEffect(() => { fetchInitialData() }, [])
  useEffect(() => { if (selectedStudent) loadDetail(selectedStudent.id) }, [selectedStudent])
  useEffect(() => { if (tab === 'roster' && students.length > 0) loadRoster(rosterDate) }, [tab, rosterDate, students])

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

      // 최근 30일 출석 집계
      const thirtyAgo = new Date()
      thirtyAgo.setDate(thirtyAgo.getDate() - 30)
      const thirtyAgoStr = thirtyAgo.toISOString().split('T')[0]
      const allIds = (studentsData || []).map((s: any) => s.id)

      const attMap: Record<string, { present: number; late: number; absent: number }> = {}
      if (allIds.length > 0) {
        const { data: attRows } = await supabase
          .from('attendances').select('student_id, status')
          .in('student_id', allIds).gte('date', thirtyAgoStr)
        ;(attRows || []).forEach((a: any) => {
          if (!attMap[a.student_id]) attMap[a.student_id] = { present: 0, late: 0, absent: 0 }
          if (a.status === 'PRESENT') attMap[a.student_id].present++
          else if (a.status === 'LATE') attMap[a.student_id].late++
          else if (a.status === 'ABSENT') attMap[a.student_id].absent++
        })
      }

      const list: Student[] = (studentsData || []).map((u: any) => {
        const att = attMap[u.id] || { present: 0, late: 0, absent: 0 }
        const total = att.present + att.late + att.absent
        return {
          id: u.id, name: u.name, cohort: u.cohort, instrument: u.instrument,
          classes: u.classes,
          presentCount: att.present, lateCount: att.late, absentCount: att.absent,
          attendanceRate: total > 0 ? Math.round((att.present / total) * 100) : 0,
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
      const [{ data: attData }, { data: evalData }] = await Promise.all([
        supabase.from('attendances')
          .select('id, date, status').eq('student_id', studentId)
          .order('date', { ascending: false }).limit(20),
        supabase.from('evaluations')
          .select('id, score, comment, created_at, writer:writer_id(name)')
          .eq('student_id', studentId).order('created_at', { ascending: false }),
      ])
      setAttendanceLogs((attData as any) || [])
      setHistory((evalData as any) || [])
    } finally {
      setDetailLoading(false)
    }
  }

  const loadRoster = async (date: string) => {
    setRosterLoading(true)
    try {
      const allIds = students.map(s => s.id)
      const { data } = await supabase
        .from('attendances').select('student_id, status')
        .eq('date', date).in('student_id', allIds)
      const map: Record<string, 'PRESENT' | 'LATE' | 'ABSENT'> = {}
      allIds.forEach(id => { map[id] = 'PRESENT' })
      ;(data || []).forEach((a: any) => { map[a.student_id] = a.status })
      setRosterStatuses(map)
    } finally {
      setRosterLoading(false)
    }
  }

  const handleRosterSave = async () => {
    if (!currentUser) return
    setRosterSaving(true)
    try {
      const rows = students.map(s => ({
        student_id: s.id,
        teacher_id: currentUser.id,
        date: rosterDate,
        status: rosterStatuses[s.id] || 'PRESENT',
      }))
      const { error } = await supabase.from('attendances').upsert(rows, { onConflict: 'student_id,date' })
      if (error) throw error
      alert('출석부가 저장되었습니다.')
      fetchInitialData()
      if (selectedStudent) loadDetail(selectedStudent.id)
    } catch (error) {
      console.error('출석부 저장 실패:', error)
      alert('출석부 저장 중 오류가 발생했습니다.')
    } finally {
      setRosterSaving(false)
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
      setScore(5); setComment('')
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
      let csv = '작성일시,학생 이름,수업 점수(5점 만점),평가자(선생님),코멘트/특이사항\n'
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
          <h1 className={styles.title}>출결 / 평가 관리</h1>
          <p className={styles.subtitle}>학생 {students.length}명 · 최근 30일 출석 기준</p>
        </div>
        {(userRole === 'admin' || userRole === 'director') && (
          <button onClick={handleDownloadCSV} className={styles.csvBtn}>
            ⬇ 전체 평가 내역 (CSV)
          </button>
        )}
      </div>

      {canWrite && (
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${tab === 'byStudent' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('byStudent')}
          >
            학생별 조회
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'roster' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('roster')}
          >
            📅 출석부 입력
          </button>
        </div>
      )}

      {tab === 'roster' && canWrite ? (
        <div className={styles.card}>
          <div className={styles.rosterHeader}>
            <h2 className={styles.sectionTitle} style={{ border: 'none', margin: 0, padding: 0 }}>출석부</h2>
            <input
              type="date"
              value={rosterDate}
              onChange={e => setRosterDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          {rosterLoading ? (
            <div className={styles.loading}>불러오는 중...</div>
          ) : students.length === 0 ? (
            <div className={styles.empty}>담당 학생이 없습니다.</div>
          ) : (
            <>
              {students.map(s => (
                <div key={s.id} className={styles.rosterRow}>
                  <div className={styles.rosterName}>
                    {s.name}
                    {s.classes?.name && <span className={styles.className} style={{ marginLeft: 8 }}>{s.classes.name}</span>}
                  </div>
                  <div className={styles.rosterBtns}>
                    {(['PRESENT', 'LATE', 'ABSENT'] as const).map(st => {
                      const cfg = STATUS_CONFIG[st]
                      const active = rosterStatuses[s.id] === st
                      return (
                        <button
                          key={st}
                          type="button"
                          className={styles.statusBtn}
                          style={active ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color } : undefined}
                          onClick={() => setRosterStatuses(prev => ({ ...prev, [s.id]: st }))}
                        >
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <button onClick={handleRosterSave} className={styles.submitBtn} disabled={rosterSaving} style={{ marginTop: 16 }}>
                {rosterSaving ? '저장 중...' : '출석부 저장하기'}
              </button>
            </>
          )}
        </div>
      ) : (
      <div className={styles.layout}>
        {/* ── 왼쪽: 학생 목록 ── */}
        <div className={styles.studentList}>
          <div className={styles.listHeader}>학생 목록 ({students.length}명)</div>
          {students.length === 0 ? (
            <div className={styles.empty} style={{ padding: '20px' }}>담당 학생이 없습니다.</div>
          ) : students.map(s => {
            const rateColor = s.attendanceRate >= 80 ? '#16a34a' : s.attendanceRate >= 60 ? '#d97706' : '#dc2626'
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
                </div>
                <div className={styles.rateWrap}>
                  <span className={styles.rateNum} style={{ color: rateColor }}>{s.attendanceRate}%</span>
                  <span className={styles.rateLabel}>출석률</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 오른쪽: 상세 패널 ── */}
        <div className={styles.mainContent}>
          {!selectedStudent ? (
            <div className={styles.card} style={{ textAlign: 'center', color: '#a0aec0', padding: '60px 0' }}>
              왼쪽 명단에서 학생을 선택해주세요.
            </div>
          ) : detailLoading ? (
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
                <div className={styles.profileStats}>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum} style={{ color: '#16a34a' }}>{selectedStudent.presentCount}</span>
                    <span className={styles.profileStatLabel}>출석</span>
                  </div>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum} style={{ color: '#d97706' }}>{selectedStudent.lateCount}</span>
                    <span className={styles.profileStatLabel}>지각</span>
                  </div>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum} style={{ color: '#dc2626' }}>{selectedStudent.absentCount}</span>
                    <span className={styles.profileStatLabel}>결석</span>
                  </div>
                </div>
              </div>

              {/* ── 출결 현황 섹션 ── */}
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>📅 출결 현황 <span className={styles.sectionSub}>최근 20회</span></h2>
                {attendanceLogs.length === 0 ? (
                  <div className={styles.emptySmall}>출석 기록이 없습니다.</div>
                ) : (
                  <div className={styles.attendanceGrid}>
                    {attendanceLogs.map(a => {
                      const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.PRESENT
                      const label = new Date(a.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })
                      return (
                        <div key={a.id} className={styles.attChip}>
                          <span className={styles.attDate}>{label}</span>
                          <span className={styles.attStatus} style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── 평가 등록 섹션 ── */}
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>✏️ 평가 등록</h2>
                <form onSubmit={handleSubmit}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>수업 점수 (5점 만점)</label>
                    <select value={score} onChange={e => setScore(Number(e.target.value))} className={styles.select}>
                      <option value={5}>⭐⭐⭐⭐⭐ 5점 — 매우 우수</option>
                      <option value={4}>⭐⭐⭐⭐ 4점 — 우수</option>
                      <option value={3}>⭐⭐⭐ 3점 — 보통</option>
                      <option value={2}>⭐⭐ 2점 — 미흡</option>
                      <option value={1}>⭐ 1점 — 매우 미흡</option>
                    </select>
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

              {/* ── 평가 내역 섹션 ── */}
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>📝 평가 내역 <span className={styles.sectionSub}>{history.length}건</span></h2>
                {history.length === 0 ? (
                  <div className={styles.emptySmall}>아직 등록된 평가 내역이 없습니다.</div>
                ) : history.map(item => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyHeader}>
                      <span className={styles.historyScore}>{'⭐'.repeat(item.score)} ({item.score}점)</span>
                      <span className={styles.historyDate}>{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                      <span className={styles.historyWriter}>{(item.writer as any)?.name || '알 수 없음'} 선생님</span>
                    </div>
                    <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#2d3748' }}>{item.comment}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
