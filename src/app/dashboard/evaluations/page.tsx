"use client";

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './evaluations.module.css'

interface Student {
  id: string
  name: string
  classes?: { name: string }
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
  const [history, setHistory] = useState<Evaluation[]>([])
  
  // 폼 상태
  const [score, setScore] = useState<number>(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchInitialData()
  }, [])

  // 학생을 선택하면 해당 학생의 평가 내역을 불러옴
  useEffect(() => {
    if (selectedStudent) {
      fetchHistory(selectedStudent.id)
    }
  }, [selectedStudent])

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single()

      if (!userData) return
      
      setCurrentUser({ id: user.id, name: userData.name })
      setUserRole(userData.role)

      // 권한별 학생 목록 불러오기 로직
      let studentQuery = supabase
        .from('users')
        .select('id, name, classes(name)')
        .eq('role', 'student')
        .eq('is_active', true)
        .order('name')

      if (userData.role === 'teacher') {
        // 선생님: 본인이 담당하는 반(class)의 학생만 조회
        const { data: myClasses } = await supabase
          .from('classes')
          .select('id')
          .or(`professor_id.eq.${user.id},instructor_id.eq.${user.id}`)
        
        if (myClasses && myClasses.length > 0) {
          const classIds = myClasses.map(c => c.id)
          studentQuery = studentQuery.in('class_id', classIds)
        } else {
          // 담당하는 반이 없으면 빈 목록
          setStudents([])
          setLoading(false)
          return
        }
      }

      const { data: studentsData } = await studentQuery
      // TypeScript 에러 방지를 위해 as any 추가
      setStudents((studentsData as any) || [])
    } catch (error) {
      console.error('데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async (studentId: string) => {
    const { data } = await supabase
      .from('evaluations')
      .select(`
        id, score, comment, created_at,
        writer:writer_id(name)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      
    setHistory((data as any) || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudent || !currentUser) return
    setIsSubmitting(true)

    try {
      const { error } = await supabase
        .from('evaluations')
        .insert({
          student_id: selectedStudent.id,
          writer_id: currentUser.id,
          score: score,
          comment: comment.trim()
        })

      if (error) throw error

      alert('평가가 성공적으로 등록되었습니다.')
      setScore(5)
      setComment('')
      fetchHistory(selectedStudent.id) // 내역 새로고침
    } catch (error) {
      console.error('평가 등록 실패:', error)
      alert('평가 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 관리자/디렉터용: 전체 평가 내역 CSV 엑셀 다운로드
  const handleDownloadCSV = async () => {
    try {
      const { data, error } = await supabase
        .from('evaluations')
        .select(`
          score, comment, created_at,
          student:student_id(name),
          writer:writer_id(name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) return alert('다운로드할 데이터가 없습니다.')

      // CSV 헤더
      let csvContent = "작성일시,학생 이름,수업 점수(5점 만점),평가자(선생님),코멘트/특이사항\n"
      
      data.forEach((row: any) => {
        const date = new Date(row.created_at).toLocaleDateString()
        const studentName = row.student?.name || '알 수 없음'
        const writerName = row.writer?.name || '알 수 없음'
        // 코멘트에 쉼표나 줄바꿈이 있을 경우를 대비해 큰따옴표로 감쌈
        const safeComment = `"${(row.comment || '').replace(/"/g, '""')}"`
        
        csvContent += `${date},${studentName},${row.score}점,${writerName},${safeComment}\n`
      })

      // 한글 깨짐 방지를 위한 UTF-8 BOM 추가
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
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

  // 학생 계정은 이 페이지 접근 불가 처리 (안전장치)
  if (userRole === 'student') return <div className={styles.empty}>접근 권한이 없습니다.</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>강의 평가 (수업 일지)</h1>
        {/* 관리자와 디렉터만 CSV 다운로드 버튼 보임 */}
        {(userRole === 'admin' || userRole === 'director') && (
          <button onClick={handleDownloadCSV} className={styles.csvBtn}>
            ⬇ 전체 내역 다운로드 (CSV)
          </button>
        )}
      </div>

      <div className={styles.layout}>
        {/* 왼쪽: 학생 목록 */}
        <div className={styles.studentList}>
          <div className={styles.listHeader}>평가 대상 학생 ({students.length}명)</div>
          {students.length === 0 ? (
            <div className={styles.empty} style={{ padding: '20px' }}>담당 학생이 없습니다.</div>
          ) : (
            students.map(student => (
              <div 
                key={student.id} 
                className={`${styles.studentItem} ${selectedStudent?.id === student.id ? styles.studentItemActive : ''}`}
                onClick={() => setSelectedStudent(student)}
              >
                <div className={styles.studentName}>{student.name}</div>
                <div className={styles.className}>{student.classes?.name || '소속 반 없음'}</div>
              </div>
            ))
          )}
        </div>

        {/* 오른쪽: 평가 작성 폼 및 과거 내역 */}
        <div className={styles.mainContent}>
          {selectedStudent ? (
            <>
              {/* 평가 작성 폼 */}
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>{selectedStudent.name} 학생 평가 작성</h2>
                <form onSubmit={handleSubmit}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>수업 점수 (5점 만점)</label>
                    <select 
                      value={score} 
                      onChange={(e) => setScore(Number(e.target.value))} 
                      className={styles.select}
                    >
                      <option value={5}>⭐⭐⭐⭐⭐ (5점 - 매우 우수)</option>
                      <option value={4}>⭐⭐⭐⭐ (4점 - 우수)</option>
                      <option value={3}>⭐⭐⭐ (3점 - 보통)</option>
                      <option value={2}>⭐⭐ (2점 - 미흡)</option>
                      <option value={1}>⭐ (1점 - 매우 미흡)</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>수업 태도 및 특이사항</label>
                    <textarea 
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="오늘 수업에서의 태도, 진도, 칭찬할 점이나 보완할 점을 자유롭게 적어주세요."
                      className={styles.textarea}
                      required
                    />
                  </div>
                  <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                    {isSubmitting ? '등록 중...' : '평가 등록하기'}
                  </button>
                </form>
              </div>

              {/* 과거 평가 내역 */}
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>과거 평가 내역</h2>
                {history.length === 0 ? (
                  <div className={styles.empty}>아직 등록된 평가 내역이 없습니다.</div>
                ) : (
                  history.map(item => (
                    <div key={item.id} className={styles.historyItem}>
                      <div className={styles.historyHeader}>
                        <span className={styles.historyScore}>{"⭐".repeat(item.score)} ({item.score}점)</span>
                        <span className={styles.historyDate}>{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: '14px', lineHeight: '1.5' }}>{item.comment}</div>
                      <span className={styles.historyWriter}>작성자: {item.writer?.name || '알 수 없음'}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className={styles.card} style={{ textAlign: 'center', color: '#a0aec0', padding: '60px 0' }}>
              왼쪽 명단에서 평가할 학생을 선택해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}