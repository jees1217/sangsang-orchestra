'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './classes.module.css'

interface ClassData {
  id: string
  name: string
  is_integrated: boolean
  meeting_link: string
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassData[]>([])
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchClasses()
  }, [])

  const fetchClasses = async () => {
    try {
      // 1. 현재 로그인한 유저 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('role, class_id')
        .eq('id', user.id)
        .single()

      if (!userData) return
      setUserRole(userData.role)

      // 2. 권한(Role)에 따라 보여줄 반(Class) 목록 다르게 가져오기
      let query = supabase.from('classes').select('*').order('created_at', { ascending: true })

      if (userData.role === 'student') {
        // 학생: 본인이 소속된 반(class_id) 이거나 전체 통합 수업(is_integrated)만 보임
        if (userData.class_id) {
          query = query.or(`id.eq.${userData.class_id},is_integrated.eq.true`)
        } else {
          query = query.eq('is_integrated', true) // 소속반이 없으면 통합수업만
        }
      } else if (userData.role === 'teacher') {
        // 선생님: 담당 반만 보임
        query = query.eq('teacher_id', user.id)
      } 
      // admin과 director는 조건 없이 모든 반을 다 가져옴

      const { data: classData, error } = await query

      if (error) throw error
      setClasses(classData || [])
    } catch (error) {
      console.error('반 목록 불러오기 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 관리자/선생님이 링크를 수정하고 저장하는 함수
  const handleUpdateLink = async (classId: string, newLink: string) => {
    setUpdatingId(classId)
    try {
      const { error } = await supabase
        .from('classes')
        .update({ meeting_link: newLink })
        .eq('id', classId)

      if (error) throw error
      alert('수업 링크가 성공적으로 저장되었습니다!')
    } catch (error) {
      console.error('링크 저장 에러:', error)
      alert('링크 저장에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  // 화면에서 링크 입력칸의 글자를 바꿀 때 (임시로 화면 상태만 업데이트)
  const handleLinkChange = (classId: string, value: string) => {
    setClasses(classes.map(c => c.id === classId ? { ...c, meeting_link: value } : c))
  }

  if (loading) return <div className={styles.loading}>수업 정보를 불러오는 중입니다...</div>

  // 학생인지 여부에 따라 화면 UI 분리
  const isStudent = userRole === 'student'

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{isStudent ? '나의 수업 링크' : '수업 링크 관리'}</h1>

      {classes.length === 0 ? (
        <div className={styles.empty}>배정된 수업이 없습니다.</div>
      ) : (
        classes.map((cls) => (
          <div key={cls.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                {cls.name}
                {cls.is_integrated && <span className={styles.integratedBadge}>전체 통합 합주</span>}
              </h2>
              {!isStudent && <span className={styles.badge}>관리용</span>}
            </div>

            {/* 학생 화면: 클릭하면 바로 넘어가는 크고 예쁜 입장 버튼 */}
            {isStudent ? (
              cls.meeting_link ? (
                <a href={cls.meeting_link} target="_blank" rel="noopener noreferrer" className={styles.joinBtn}>
                  수업 입장하기 (Zoom/Meet)
                </a>
              ) : (
                <div style={{ color: '#e53e3e', fontWeight: 'bold', textAlign: 'center' }}>
                  아직 선생님이 링크를 등록하지 않았습니다.
                </div>
              )
            ) : (
              /* 선생님/관리자 화면: 원클릭 입장 버튼 + 링크 수정 폼 동시 제공 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* 1. 링크가 등록되어 있을 때만 '수업 입장(확인) 버튼' 표시 */}
                {cls.meeting_link && (
                  <a href={cls.meeting_link} target="_blank" rel="noopener noreferrer" className={styles.joinBtn} style={{ backgroundColor: '#2b6cb0' }}>
                    수업 입장 및 확인하기 (관리자/선생님용)
                  </a>
                )}
                
                {/* 2. 링크를 새로 올리거나 수정하는 폼 */}
                <div className={styles.inputGroup}>
                  <input
                    type="url"
                    placeholder="새로운 Zoom 또는 구글밋 링크(URL)를 입력하세요"
                    value={cls.meeting_link || ''}
                    onChange={(e) => handleLinkChange(cls.id, e.target.value)}
                    className={styles.input}
                  />
                  <button
                    onClick={() => handleUpdateLink(cls.id, cls.meeting_link)}
                    className={styles.saveBtn}
                    disabled={updatingId === cls.id}
                  >
                    {updatingId === cls.id ? '저장 중...' : '저장하기'}
                  </button>
                </div>

              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}