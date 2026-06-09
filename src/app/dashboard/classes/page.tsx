'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './classes.module.css'

interface ClassData {
  id: string
  name: string
  is_integrated: boolean
  meeting_link: string
  teacher_ids: string[] | null
}

interface Teacher {
  id: string
  name: string
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassData[]>([])
  const [userRole, setUserRole] = useState<string>('')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [togglingTeacher, setTogglingTeacher] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { fetchClasses() }, [])

  const fetchClasses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('role, class_id')
        .eq('id', user.id)
        .single()

      if (!userData) return
      setUserRole(userData.role)

      let query = supabase.from('classes').select('*').order('created_at', { ascending: true })

      if (userData.role === 'student') {
        if (userData.class_id) {
          query = query.or(`id.eq.${userData.class_id},is_integrated.eq.true`)
        } else {
          query = query.eq('is_integrated', true)
        }
      } else if (userData.role === 'teacher') {
        query = query.filter('teacher_ids', 'cs', `{${user.id}}`)
      }

      const [{ data: classData, error }, { data: teacherData }] = await Promise.all([
        query,
        supabase.from('users').select('id, name').in('role', ['teacher', 'director']).order('name'),
      ])

      if (error) throw error
      setClasses((classData || []) as ClassData[])
      setTeachers(teacherData || [])
    } catch (error) {
      console.error('반 목록 불러오기 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateLink = async (classId: string, newLink: string) => {
    setUpdatingId(classId)
    try {
      const { error } = await supabase.from('classes').update({ meeting_link: newLink }).eq('id', classId)
      if (error) throw error
      alert('수업 링크가 성공적으로 저장되었습니다!')
    } catch {
      alert('링크 저장에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleLinkChange = (classId: string, value: string) => {
    setClasses(classes.map(c => c.id === classId ? { ...c, meeting_link: value } : c))
  }

  const handleToggleTeacher = async (classId: string, teacherId: string, checked: boolean) => {
    setTogglingTeacher(`${classId}-${teacherId}`)
    try {
      const cls = classes.find(c => c.id === classId)
      const current = cls?.teacher_ids || []
      const newIds = checked
        ? [...current, teacherId]
        : current.filter(id => id !== teacherId)

      const { error } = await supabase.from('classes').update({ teacher_ids: newIds }).eq('id', classId)
      if (error) throw error
      setClasses(classes.map(c => c.id === classId ? { ...c, teacher_ids: newIds } : c))
    } catch {
      alert('선생님 저장에 실패했습니다.')
    } finally {
      setTogglingTeacher(null)
    }
  }

  if (loading) return <div className={styles.loading}>수업 정보를 불러오는 중입니다...</div>

  const isStudent = userRole === 'student'
  const canEdit = userRole === 'admin' || userRole === 'director'

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{isStudent ? '나의 수업 링크' : '수업 링크 관리'}</h1>

      {classes.length === 0 ? (
        <div className={styles.empty}>배정된 수업이 없습니다.</div>
      ) : (
        classes.map((cls) => {
          const assignedIds = cls.teacher_ids || []
          const assignedNames = assignedIds
            .map(id => teachers.find(t => t.id === id)?.name)
            .filter(Boolean)

          return (
            <div key={cls.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  {cls.name}
                  {cls.is_integrated && <span className={styles.integratedBadge}>전체 통합 합주</span>}
                </h2>
                {!isStudent && <span className={styles.badge}>관리용</span>}
              </div>

              {!isStudent && assignedNames.length > 0 && (
                <div style={{ fontSize: 13, color: '#4a5568', marginBottom: 4 }}>
                  👨‍🏫 {assignedNames.join(', ')} 선생님
                </div>
              )}

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {cls.meeting_link && (
                    <a href={cls.meeting_link} target="_blank" rel="noopener noreferrer" className={styles.joinBtn} style={{ backgroundColor: '#2b6cb0' }}>
                      수업 입장 및 확인하기 (관리자/선생님용)
                    </a>
                  )}

                  {/* 담당 선생님 체크박스 (admin/director만) */}
                  {canEdit && (
                    <div>
                      <div style={{ fontSize: 12, color: '#718096', marginBottom: 6, fontWeight: 600 }}>담당 선생님</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {teachers.map(t => {
                          const key = `${cls.id}-${t.id}`
                          const checked = assignedIds.includes(t.id)
                          return (
                            <label key={t.id} style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              fontSize: 13, cursor: 'pointer',
                              opacity: togglingTeacher === key ? 0.5 : 1,
                            }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={togglingTeacher === key}
                                onChange={e => handleToggleTeacher(cls.id, t.id, e.target.checked)}
                              />
                              {t.name}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Zoom 링크 수정 */}
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
          )
        })
      )}
    </div>
  )
}
