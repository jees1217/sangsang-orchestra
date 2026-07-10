'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './assignments.module.css'

export default function StudentAssignmentsPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>('')
  const [assignments, setAssignments] = useState<any[]>([])
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchAssignments()
  }, [])

  const fetchAssignments = async () => {
    try {
      // 1. 현재 로그인한 학생 본인 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: userData } = await supabase
        .from('users')
        .select('cohort, class_id')
        .eq('id', user.id)
        .single()

      if (!userData) return

      // 2. 오케스트라 전체 과제 공지 가져오기
      const { data: noticesData } = await supabase
        .from('notices')
        .select('*')
        .eq('type', 'assignment')
        .order('created_at', { ascending: false })

      // 3. 내 과제 체크 정보 가져오기
      const { data: submissionsData } = await supabase
        .from('submissions')
        .select('*') //
        .eq('student_id', user.id)

      const submissionMap: Record<string, any> = {}
      submissionsData?.forEach(s => {
        submissionMap[s.notice_id] = s
      })

      // 4. 기수와 반에 맞는 과제만 필터링하여 매칭
      const myAssignments = (noticesData || [])
        .filter(n => {
          if (n.target_type === 'all') return true
          if (n.target_type === 'cohort' && n.target_cohort === userData.cohort) return true
          if (n.target_type === 'class' && n.target_class_id === userData.class_id) return true
          if (n.target_type === 'individual' && n.target_user_id === user.id) return true
          return false
        })
        .map(n => ({
          ...n,
          isChecked: !!submissionMap[n.id],
          checkedAt: submissionMap[n.id]?.created_at || null
        }))

      setAssignments(myAssignments)
    } catch (error) {
      console.error('과제 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // [확인 완료] 버튼 클릭 시 장부에 도장 찍는 함수
  const handleCheckAssignment = async (noticeId: string) => {
    setSubmittingId(noticeId)
    try {
      const { error } = await supabase
        .from('submissions')
        .insert({
          notice_id: noticeId,
          student_id: userId,
          created_at: new Date().toISOString()
        })

      if (error) throw error

      alert('과제 확인 체크가 완료되었습니다! 잊지 말고 카카오톡으로 연주 영상을 전송해 주세요. 🎻')
      fetchAssignments() // 화면 새로고침
    } catch (error) {
      console.error('확인 처리 실패:', error)
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setSubmittingId(null)
    }
  }

  if (loading) return <div className={styles.loading}>과제 정보를 수신 중입니다...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>내 과제 확인 및 체크</h1>
      <p style={{ color: '#718096', marginBottom: '24px', fontSize: '14px', lineHeight: '1.5' }}>
        💡 과제 내용을 확인하신 후 맨 아래 <strong>[✅ 과제 확인 완료]</strong> 버튼을 꼭 눌러주세요!<br />
        실제 연주 영상 및 사진 자료는 기존대로 <strong>선생님 카카오톡</strong>으로 제출하시면 됩니다.
      </p>

      {assignments.length === 0 ? (
        <div className={styles.empty}>부여된 연주 과제가 없습니다. 즐거운 하루 보내세요! 🎵</div>
      ) : (
        <div className={styles.grid}>
          {assignments.map((asm) => (
            <div key={asm.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={`${styles.statusBadge} ${asm.isChecked ? styles.statusSubmitted : styles.statusPending}`}>
                  {asm.isChecked ? '✅ 확인 완료' : '⏳ 미확인 과제'}
                </span>
                {asm.due_date && (
                  <span className={styles.dueDate}>
                    제출 마감: {new Date(asm.due_date).toLocaleDateString()}
                  </span>
                )}
              </div>

              <h3 className={styles.assignmentTitle}>{asm.title}</h3>
              <div className={styles.assignmentContent}>{asm.content}</div>

              {/* 하단 버튼 영역 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
                {asm.isChecked ? (
                  <div style={{ color: '#2b6cb0', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#ebf8ff', padding: '10px 16px', borderRadius: '6px' }}>
                    🎉 {new Date(asm.checkedAt).toLocaleDateString('ko-KR')} 에 과제 확인을 완료했습니다.
                  </div>
                ) : (
                  <button
                    className={styles.submitBtn}
                    onClick={() => handleCheckAssignment(asm.id)}
                    disabled={submittingId === asm.id}
                  >
                    {submittingId === asm.id ? '처리 중...' : '✅ 과제 확인 완료'}
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  )
}