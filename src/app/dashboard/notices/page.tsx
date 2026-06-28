'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './notices.module.css'

export default function NoticesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  
  // 데이터 목록
  const [myClasses, setMyClasses] = useState<any[]>([])
  const [allClasses, setAllClasses] = useState<any[]>([])
  const [allStudents, setAllStudents] = useState<any[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [notices, setNotices] = useState<any[]>([])

  // 폼 상태
  const [type, setType] = useState<'notice' | 'assignment'>('notice')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [targetType, setTargetType] = useState<'all' | 'cohort' | 'class' | 'individual' | 'teachers' | 'admins'>('all')
  const [targetCohort, setTargetCohort] = useState<string>('4')
  
  // [추가됨] 반/개인 선택 시 목록을 좁혀주기 위한 1차 기수 필터 상태
  const [filterCohort, setFilterCohort] = useState<string>('4') 
  
  const [targetClassId, setTargetClassId] = useState<string>('')
  const [targetUserId, setTargetUserId] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase.from('users').select('role, name').eq('id', user.id).single()
      if (!userData) return
      
      setCurrentUser({ id: user.id, name: userData.name })
      const role = userData.role
      setUserRole(role)

      // 디렉터/어드민용 전체 반 & 전체 학생 불러오기
      if (role === 'admin' || role === 'director') {
        const { data: cData } = await supabase.from('classes').select('id, name, cohort')
        setAllClasses(cData || [])

        const { data: sData } = await supabase.from('users').select('id, name, cohort').eq('role', 'student').order('name')
        setAllStudents(sData || [])

        // 작성자 이름 표시용 — 전체 유저 id→name 맵
        const { data: uData } = await supabase.from('users').select('id, name')
        const map: Record<string, string> = {}
        ;(uData || []).forEach((u: any) => { map[u.id] = u.name })
        setUserMap(map)
      } 
      // 선생님용 담당 반 불러오기
      else if (role === 'teacher') {
        const { data: tClasses } = await supabase.from('classes').select('id, name, cohort').filter('teacher_ids', 'cs', `{${user.id}}`)
        setMyClasses(tClasses || [])
        setTargetType('class') // 선생님은 무조건 반 타겟으로 고정
        if (tClasses && tClasses.length > 0) setTargetClassId(tClasses[0].id)
      }

      fetchNotices(role, user.id)

    } catch (error) {
      console.error('데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchNotices = async (role: string, userId: string) => {
    let query = supabase.from('notices').select('*').order('created_at', { ascending: false })

    if (role === 'teacher') {
      query = query.eq('writer_id', userId)
    }

    const { data, error } = await query
    if (error) {
      console.error('notices 조회 오류:', error.message, error.code)
    }
    setNotices(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해주세요.')
    
    setIsSubmitting(true)

    const payload: any = {
      type, title, content, writer_id: currentUser.id, target_type: targetType
    }

    if (type === 'assignment' && dueDate) payload.due_date = dueDate
    if (targetType === 'cohort') payload.target_cohort = Number(targetCohort)
    if (targetType === 'class') {
      if (!targetClassId) { setIsSubmitting(false); return alert('반을 선택해주세요.'); }
      payload.target_class_id = targetClassId
    }
    if (targetType === 'individual') {
      if (!targetUserId) { setIsSubmitting(false); return alert('학생을 선택해주세요.'); }
      payload.target_user_id = targetUserId
    }

    try {
      const { error } = await supabase.from('notices').insert(payload)
      if (error) throw error

      alert('성공적으로 등록되었습니다.')
      setTitle(''); setContent(''); setDueDate(''); setTargetClassId(''); setTargetUserId('');
      await fetchNotices(userRole, currentUser.id)
    } catch (error) {
      console.error('등록 실패:', error)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getTargetLabel = (notice: any) => {
    switch (notice.target_type) {
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
      case 'teachers': return '선생님 그룹'
      case 'admins': return '관리자 그룹'
      default: return '지정 안됨'
    }
  }

  if (loading) return <div className={styles.loading}>페이지를 불러오는 중입니다...</div>
  if (userRole === 'student') return <div className={styles.empty}>접근 권한이 없습니다.</div>

  const isManagement = userRole === 'admin' || userRole === 'director'

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

            {/* 관리자/디렉터용 타겟 선택 드롭다운 */}
            {isManagement ? (
              <div className={styles.formGroup}>
                <label className={styles.label}>수신 대상 (타겟팅)</label>
                <select className={styles.select} value={targetType} onChange={(e) => {
                  setTargetType(e.target.value as any)
                  setTargetClassId('')
                  setTargetUserId('')
                }} style={{ marginBottom: '8px' }}>
                  <option value="all">전체 (모든 단원)</option>
                  <option value="cohort">기수별 단체 발송</option>
                  <option value="class">반별 선택 발송</option>
                  <option value="individual">개별 학생 발송</option>
                  <option value="teachers">선생님 그룹</option>
                  <option value="admins">관리자 그룹</option>
                </select>

                {/* 1. 기수 단체 발송 시 */}
                {targetType === 'cohort' && (
                  <select className={styles.select} value={targetCohort} onChange={(e) => setTargetCohort(e.target.value)}>
                    <option value="1">1기 전체</option><option value="2">2기 전체</option><option value="3">3기 전체</option><option value="4">4기 전체</option>
                  </select>
                )}

                {/* 2. [개선됨] 반별 선택 발송 시 (기수 선택 -> 해당 기수의 반 목록) */}
                {targetType === 'class' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className={styles.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} style={{ width: '120px' }}>
                      <option value="1">1기</option><option value="2">2기</option><option value="3">3기</option><option value="4">4기</option>
                    </select>
                    <select className={styles.select} value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)}>
                      <option value="">반을 선택하세요</option>
                      {allClasses.filter(c => c.cohort === Number(filterCohort)).map(c => 
                        <option key={c.id} value={c.id}>{c.name}</option>
                      )}
                    </select>
                  </div>
                )}

                {/* 3. [개선됨] 개별 학생 발송 시 (기수 선택 -> 해당 기수의 학생 목록) */}
                {targetType === 'individual' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className={styles.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} style={{ width: '120px' }}>
                      <option value="1">1기</option><option value="2">2기</option><option value="3">3기</option><option value="4">4기</option>
                    </select>
                    <select className={styles.select} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                      <option value="">학생을 선택하세요</option>
                      {allStudents.filter(s => s.cohort === Number(filterCohort)).map(s => 
                        <option key={s.id} value={s.id}>{s.name}</option>
                      )}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              /* 선생님용 타겟 선택 (본인 담당 반 고정) */
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
              <input type="text" required className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요" />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>내용</label>
              <textarea required className={styles.textarea} value={content} onChange={(e) => setContent(e.target.value)} placeholder="상세 내용을 작성해주세요" />
            </div>

            {type === 'assignment' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>제출 마감일 (선택)</label>
                <input type="datetime-local" className={styles.input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
            {isManagement ? '전체 발송 내역' : '내가 작성한 발송 내역'}
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
                  {notice.due_date && <span style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold' }}>마감: {new Date(notice.due_date).toLocaleDateString()}</span>}
                </div>
                <h3 className={styles.cardTitle}>{notice.title}</h3>
                <div className={styles.cardContent}>{notice.content}</div>
                <div className={styles.cardFooter}>
                  <span>작성자: {userMap[notice.writer_id] || notice.writer_id?.slice(0, 8) || '알 수 없음'}</span>
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