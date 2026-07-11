'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './notices.module.css'

type TargetType = 'all' | 'cohort' | 'class' | 'individual' | 'teachers' | 'admins' | 'individual_teacher' | 'individual_admin'
type SubType = 'all' | 'individual'

export default function NoticesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // 데이터 목록
  const [myClasses, setMyClasses] = useState<any[]>([])
  const [allClasses, setAllClasses] = useState<any[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  const [allTeachers, setAllTeachers] = useState<any[]>([])
  const [allAdmins, setAllAdmins] = useState<any[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [notices, setNotices] = useState<any[]>([])

  // 폼 상태
  const [type, setType] = useState<'notice' | 'assignment'>('notice')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [targetCohort, setTargetCohort] = useState<string>('4')
  const [filterCohort, setFilterCohort] = useState<string>('4')
  const [targetClassId, setTargetClassId] = useState<string>('')
  const [targetUserId, setTargetUserId] = useState<string>('')
  const [teacherSubType, setTeacherSubType] = useState<SubType>('all')
  const [adminSubType, setAdminSubType] = useState<SubType>('all')
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  useEffect(() => { fetchInitialData() }, [])

  // myClasses가 로드된 후 targetClassId가 비어 있으면 첫 번째 반으로 초기화
  useEffect(() => {
    if (myClasses.length > 0 && !targetClassId) {
      setTargetClassId(myClasses[0].id)
    }
  }, [myClasses])

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase.from('users').select('role, name').eq('id', user.id).single()
      if (!userData) return

      setCurrentUser({ id: user.id, name: userData.name })
      const role = userData.role
      setUserRole(role)

      if (role === 'admin' || role === 'director') {
        const [
          { data: cData },
          { data: sData },
          { data: tData },
          { data: aData },
          { data: uData },
        ] = await Promise.all([
          supabase.from('classes').select('id, name, cohort'),
          supabase.from('users').select('id, name, cohort').eq('role', 'student').order('name'),
          supabase.from('users').select('id, name').eq('role', 'teacher').order('name'),
          supabase.from('users').select('id, name').in('role', ['admin', 'director']).order('name'),
          supabase.from('users').select('id, name'),
        ])
        setAllClasses(cData || [])
        setAllStudents(sData || [])
        setAllTeachers(tData || [])
        setAllAdmins(aData || [])
        const map: Record<string, string> = {}
        ;(uData || []).forEach((u: any) => { map[u.id] = u.name })
        setUserMap(map)
      } else if (role === 'teacher') {
        const [{ data: tClasses }, { data: uData }] = await Promise.all([
          supabase.from('classes').select('id, name, cohort').filter('teacher_ids', 'cs', `{${user.id}}`),
          supabase.from('users').select('id, name'),
        ])
        setMyClasses(tClasses || [])
        setTargetType('class')
        if (tClasses && tClasses.length > 0) setTargetClassId(tClasses[0].id)
        const map: Record<string, string> = {}
        ;(uData || []).forEach((u: any) => { map[u.id] = u.name })
        setUserMap(map)
      } else if (role === 'student') {
        const { data: uData } = await supabase.from('users').select('id, name')
        const map: Record<string, string> = {}
        ;(uData || []).forEach((u: any) => { map[u.id] = u.name })
        setUserMap(map)
      }

      fetchNotices(role, user.id)
    } catch (error) {
      console.error('데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchNotices = async (role: string, _userId: string) => {
    // 선생님: RLS가 (내가 쓴 것 + 선생님 그룹 수신 + 개별 수신)을 알아서 필터링
    // admin/director: 필터 없이 전체 조회
    // 학생: 공지사항 화면이므로 과제(assignment)는 제외 — 과제는 "나의 과제" 페이지에서 확인
    let query = supabase.from('notices').select('*').order('created_at', { ascending: false })
    if (role === 'student') query = query.eq('type', 'notice')
    const { data, error } = await query
    if (error) console.error('notices 조회 오류:', error.message, error.code)
    setNotices(data || [])
  }

  const resetForm = () => {
    setTitle(''); setContent(''); setDueDate('')
    setTargetClassId(''); setTargetUserId('')
    setTeacherSubType('all'); setAdminSubType('all')
  }

  const handleTargetTypeChange = (val: TargetType) => {
    setTargetType(val)
    setTargetClassId(''); setTargetUserId('')
    setTeacherSubType('all'); setAdminSubType('all')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해주세요.')
    setIsSubmitting(true)

    // 실제 저장할 target_type 결정
    let actualTargetType: string = targetType
    if (targetType === 'teachers' && teacherSubType === 'individual') actualTargetType = 'individual_teacher'
    if (targetType === 'admins'   && adminSubType   === 'individual') actualTargetType = 'individual_admin'

    const payload: any = {
      type, title, content, writer_id: currentUser.id, target_type: actualTargetType,
    }

    if (type === 'assignment' && dueDate) payload.due_date = dueDate
    if (actualTargetType === 'cohort') payload.target_cohort = Number(targetCohort)
    if (actualTargetType === 'class') {
      const classId = targetClassId || myClasses[0]?.id || ''
      if (!classId) { setIsSubmitting(false); return alert('반을 선택해주세요.') }
      payload.target_class_id = classId
    }
    if (actualTargetType === 'individual') {
      if (!targetUserId) { setIsSubmitting(false); return alert('학생을 선택해주세요.') }
      payload.target_user_id = targetUserId
    }
    if (actualTargetType === 'individual_teacher') {
      if (!targetUserId) { setIsSubmitting(false); return alert('선생님을 선택해주세요.') }
      payload.target_user_id = targetUserId
    }
    if (actualTargetType === 'individual_admin') {
      if (!targetUserId) { setIsSubmitting(false); return alert('관리자를 선택해주세요.') }
      payload.target_user_id = targetUserId
    }

    try {
      const { error } = await supabase.from('notices').insert(payload)
      if (error) throw error
      alert('성공적으로 등록되었습니다.')
      resetForm()
      await fetchNotices(userRole, currentUser.id)
    } catch (error) {
      console.error('등록 실패:', error)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 공지/과제를 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.')) return
    const { error } = await supabase.from('notices').delete().eq('id', id)
    if (error) {
      console.error('삭제 실패:', error)
      alert('삭제 중 오류가 발생했습니다.')
      return
    }
    await fetchNotices(userRole, currentUser.id)
  }

  const getTargetLabel = (notice: any) => {
    switch (notice.target_type as TargetType) {
      case 'all': return '전체 공지'
      case 'cohort': return `${notice.target_cohort}기 전용`
      case 'class': {
        const cls = [...allClasses, ...myClasses].find(c => c.id === notice.target_class_id)
        return cls ? `[${cls.cohort}기] ${cls.name}` : '[?기] 알 수 없는 반'
      }
      case 'individual': {
        const student = allStudents.find(s => s.id === notice.target_user_id)
        return student ? `[${student.cohort}기] ${student.name}` : '[?기] 알 수 없는 학생'
      }
      case 'teachers': return '선생님 전체'
      case 'admins':   return '관리자 전체'
      case 'individual_teacher': return `선생님: ${userMap[notice.target_user_id] || '알 수 없음'}`
      case 'individual_admin':   return `관리자: ${userMap[notice.target_user_id] || '알 수 없음'}`
      default: return '지정 안됨'
    }
  }

  if (loading) return <div className={styles.loading}>페이지를 불러오는 중입니다...</div>

  const isManagement = userRole === 'admin' || userRole === 'director'
  const isStudent = userRole === 'student'

  // 학생: 읽기 전용 리스트만 표시
  if (isStudent) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>공지사항</h1>
        {notices.length === 0 ? (
          <div className={styles.empty}>등록된 공지나 과제가 없습니다.</div>
        ) : (
          notices.map(notice => (
            <div key={notice.id} className={styles.noticeCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={`${styles.badge} ${notice.type === 'notice' ? styles.badgeNotice : styles.badgeAssignment}`}>
                    {notice.type === 'notice' ? '공지' : '과제'}
                  </span>
                </div>
                {notice.due_date && (
                  <span style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold' }}>
                    마감: {new Date(notice.due_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h3 className={styles.cardTitle}>{notice.title}</h3>
              <div className={styles.cardContent}>{notice.content}</div>
              <div className={styles.cardFooter}>
                <span>작성자: {userMap[notice.writer_id] || '알 수 없음'}</span>
                <span>{new Date(notice.created_at).toLocaleString('ko-KR')}</span>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>과제 및 공지 관리</h1>

      <div className={styles.layout}>
        {/* 왼쪽: 작성 폼 */}
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>새로운 내용 작성</h2>
          <form onSubmit={handleSubmit}>

            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input type="radio" name="type" checked={type === 'notice'} onChange={() => setType('notice')} />
                📢 일반 공지
              </label>
              <label className={styles.radioLabel}>
                <input type="radio" name="type" checked={type === 'assignment'} onChange={() => setType('assignment')} />
                📝 과제 부여
              </label>
            </div>

            {isManagement ? (
              <div className={styles.formGroup}>
                <label className={styles.label}>수신 대상</label>
                <select
                  className={styles.select}
                  value={targetType}
                  onChange={(e) => handleTargetTypeChange(e.target.value as TargetType)}
                  style={{ marginBottom: '8px' }}
                >
                  <option value="all">전체 (모든 단원)</option>
                  <option value="cohort">기수별 단체 발송</option>
                  <option value="class">반별 선택 발송</option>
                  <option value="individual">개별 학생 발송</option>
                  <option value="teachers">선생님</option>
                  <option value="admins">관리자</option>
                </select>

                {/* 기수별 */}
                {targetType === 'cohort' && (
                  <select className={styles.select} value={targetCohort} onChange={(e) => setTargetCohort(e.target.value)}>
                    <option value="1">1기 전체</option>
                    <option value="2">2기 전체</option>
                    <option value="3">3기 전체</option>
                    <option value="4">4기 전체</option>
                  </select>
                )}

                {/* 반별 */}
                {targetType === 'class' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className={styles.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} style={{ width: '120px' }}>
                      <option value="1">1기</option><option value="2">2기</option>
                      <option value="3">3기</option><option value="4">4기</option>
                    </select>
                    <select className={styles.select} value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)}>
                      <option value="">반을 선택하세요</option>
                      {allClasses.filter(c => c.cohort === Number(filterCohort)).map(c =>
                        <option key={c.id} value={c.id}>{c.name}</option>
                      )}
                    </select>
                  </div>
                )}

                {/* 개별 학생 */}
                {targetType === 'individual' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className={styles.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} style={{ width: '120px' }}>
                      <option value="1">1기</option><option value="2">2기</option>
                      <option value="3">3기</option><option value="4">4기</option>
                    </select>
                    <select className={styles.select} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                      <option value="">학생을 선택하세요</option>
                      {allStudents.filter(s => s.cohort === Number(filterCohort)).map(s =>
                        <option key={s.id} value={s.id}>{s.name}</option>
                      )}
                    </select>
                  </div>
                )}

                {/* 선생님 — 전체/개별 */}
                {targetType === 'teachers' && (
                  <div>
                    <div className={styles.radioGroup} style={{ marginBottom: '8px' }}>
                      <label className={styles.radioLabel}>
                        <input type="radio" name="teacherSubType" checked={teacherSubType === 'all'}
                          onChange={() => { setTeacherSubType('all'); setTargetUserId('') }} />
                        전체
                      </label>
                      <label className={styles.radioLabel}>
                        <input type="radio" name="teacherSubType" checked={teacherSubType === 'individual'}
                          onChange={() => setTeacherSubType('individual')} />
                        개별 선택
                      </label>
                    </div>
                    {teacherSubType === 'individual' && (
                      <select className={styles.select} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                        <option value="">선생님을 선택하세요</option>
                        {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {/* 관리자 — 전체/개별 */}
                {targetType === 'admins' && (
                  <div>
                    <div className={styles.radioGroup} style={{ marginBottom: '8px' }}>
                      <label className={styles.radioLabel}>
                        <input type="radio" name="adminSubType" checked={adminSubType === 'all'}
                          onChange={() => { setAdminSubType('all'); setTargetUserId('') }} />
                        전체
                      </label>
                      <label className={styles.radioLabel}>
                        <input type="radio" name="adminSubType" checked={adminSubType === 'individual'}
                          onChange={() => setAdminSubType('individual')} />
                        개별 선택
                      </label>
                    </div>
                    {adminSubType === 'individual' && (
                      <select className={styles.select} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                        <option value="">관리자를 선택하세요</option>
                        {allAdmins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.label}>수신 대상 (담당 반)</label>
                <select className={styles.select} value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)} required>
                  {myClasses.length === 0 && <option value="">담당하는 반이 없습니다.</option>}
                  {myClasses.map(c => <option key={c.id} value={c.id}>[{c.cohort}기] {c.name}</option>)}
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>제목</label>
              <input type="text" required className={styles.input} value={title}
                onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요" />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>내용</label>
              <textarea required className={styles.textarea} value={content}
                onChange={(e) => setContent(e.target.value)} placeholder="상세 내용을 작성해주세요" />
            </div>

            {type === 'assignment' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>제출 마감일 (선택)</label>
                <input type="datetime-local" className={styles.input} value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? '발송 중...' : '작성 완료 및 발송'}
            </button>
          </form>
        </div>

        {/* 오른쪽: 발송 내역 */}
        <div className={styles.listSection}>
          <h2 className={styles.sectionTitle}>
            {isManagement ? '전체 발송 내역' : '과제 및 공지 리스트'}
          </h2>
          {notices.length === 0 ? (
            <div className={styles.empty}>작성된 과제나 공지가 없습니다.</div>
          ) : (
            notices.map(notice => (
              <div key={notice.id} className={styles.noticeCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={`${styles.badge} ${notice.type === 'notice' ? styles.badgeNotice : styles.badgeAssignment}`}>
                      {notice.type === 'notice' ? '공지' : '과제'}
                    </span>
                    <span className={styles.targetBadge}>{getTargetLabel(notice)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {notice.due_date && (
                      <span style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold' }}>
                        마감: {new Date(notice.due_date).toLocaleDateString()}
                      </span>
                    )}
                    {isManagement && (
                      <button
                        type="button"
                        onClick={() => handleDelete(notice.id)}
                        style={{
                          fontSize: '12px', color: '#e53e3e', background: 'none',
                          border: '1px solid #e53e3e', borderRadius: '6px',
                          padding: '4px 8px', cursor: 'pointer',
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
                <h3 className={styles.cardTitle}>{notice.title}</h3>
                <div className={styles.cardContent}>{notice.content}</div>
                <div className={styles.cardFooter}>
                  <span>작성자: {userMap[notice.writer_id] || '알 수 없음'}</span>
                  <span>{new Date(notice.created_at).toLocaleString('ko-KR')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
