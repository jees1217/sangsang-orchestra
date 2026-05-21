'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'

type User = {
  id: string
  email: string
  name: string
  role: string
  cohort?: number | null
  instrument?: string | null
  created_at: string
}

interface MemberListClientProps {
  initialUsers: User[]
}

const roleLabels: Record<string, string> = {
  admin: '관리자',
  director: '디렉터',
  teacher: '선생님',
  student: '학생'
}

export default function MemberListClient({ initialUsers }: MemberListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  // 🔍 [추가됨] 검색 및 필터 상태
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterCohort, setFilterCohort] = useState('all')
  const [filterInstrument, setFilterInstrument] = useState('all')
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newMember, setNewMember] = useState({ 
    email: '', password: '', name: '', role: 'student', 
    cohort: '4', instrument: '' 
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type })
    setTimeout(() => setFeedback(null), 3000)
  }

  // 🔍 [추가됨] 필터링된 유저 목록 계산 (useMemo로 성능 최적화)
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch = user.name.includes(searchTerm) || user.email.includes(searchTerm)
      const matchRole = filterRole === 'all' || user.role === filterRole
      const matchCohort = filterCohort === 'all' || (user.cohort?.toString() || 'none') === filterCohort
      const matchInstrument = filterInstrument === 'all' || (user.instrument || 'none') === filterInstrument
      
      return matchSearch && matchRole && matchCohort && matchInstrument
    })
  }, [users, searchTerm, filterRole, filterCohort, filterInstrument])

  // 권한 변경
  const handleRoleChange = async (userId: string, newRole: string) => {
    setLoadingId(userId)
    setFeedback(null)

    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)

    if (error) {
      showFeedback(`권한 변경 실패: ${error.message}`, 'error')
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
      showFeedback('성공적으로 권한이 변경되었습니다.', 'success')
    }
    setLoadingId(null)
  }

  // 단원 삭제
  const handleDelete = async (userId: string, name: string) => {
    if (!window.confirm(`정말 ${name} 단원을 명부에서 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`)) return

    setLoadingId(userId)
    setFeedback(null)

    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || '삭제 실패')

      setUsers(users.filter(u => u.id !== userId))
      showFeedback(`${name} 단원이 성공적으로 삭제되었습니다.`, 'success')
    } catch (err: any) {
      showFeedback(`단원 삭제 실패: ${err.message}`, 'error')
    } finally {
      setLoadingId(null)
    }
  }

  // 단원 수동 추가
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFeedback(null)

    try {
      const payload = {
        ...newMember,
        cohort: newMember.cohort ? Number(newMember.cohort) : null,
        instrument: newMember.instrument || null
      }

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '유저 생성 실패')

      setUsers([data.user, ...users])
      showFeedback('새 단원이 성공적으로 추가되었습니다.', 'success')
      setIsModalOpen(false)
      setNewMember({ email: '', password: '', name: '', role: 'student', cohort: '4', instrument: '' }) 
    } catch (err: any) {
      showFeedback(`단원 추가 실패: ${err.message}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 비밀번호 초기화
  const handleResetPassword = async (userId: string) => {
    const newPassword = window.prompt('새로운 임시 비밀번호를 입력하세요 (최소 6자리):', 'sangsang1234!')
    if (!newPassword || newPassword.trim() === '') return
    if (newPassword.length < 6) return alert('비밀번호는 최소 6자리 이상이어야 합니다.')

    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, password: newPassword })
      })
      const data = await res.json()

      if (res.ok) alert('비밀번호가 성공적으로 초기화되었습니다.')
      else alert(`초기화 실패: ${data.error || '알 수 없는 에러'}`)
    } catch (err: any) {
      alert(`초기화 중 오류 발생: ${err.message}`)
    }
  }

  // CSV 다운로드 (필터링된 결과만 다운로드 되도록 수정)
  const handleExportCSV = () => {
    try {
      const headers = ['이름', '이메일', '권한', '기수', '악기', '가입일']
      const rows = filteredUsers.map(u => [
        u.name,
        u.email,
        roleLabels[u.role] || u.role,
        u.cohort ? `${u.cohort}기` : '-',
        u.instrument || '-',
        new Date(u.created_at).toLocaleDateString('ko-KR')
      ])

      const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n')
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `단원명부_추출_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      showFeedback('CSV 다운로드가 시작되었습니다.', 'success')
    } catch (error) {
      showFeedback('CSV 다운로드 중 오류가 발생했습니다.', 'error')
    }
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin': return styles.adminBadge
      case 'director': return styles.directorBadge
      case 'teacher': return styles.teacherBadge
      case 'student': return styles.studentBadge
      default: return styles.studentBadge
    }
  }

  return (
    <>
      <div className={styles.actionBar}>
        <div className={styles.actionButtons}>
          <button className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
            <span style={{ fontSize: '16px' }}>+</span> 단원 추가
          </button>
          <button className={styles.secondaryBtn} onClick={handleExportCSV}>
            <span>⬇️</span> 화면 명부 다운로드 (CSV)
          </button>
        </div>
      </div>

      {/* 🔍 [추가됨] 검색 및 필터 컨트롤 바 */}
      <div className={styles.filterBar}>
        <input 
          type="text" 
          placeholder="이름 또는 이메일 검색..." 
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select className={styles.filterSelect} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="all">모든 권한</option>
          <option value="student">학생만</option>
          <option value="teacher">선생님만</option>
          <option value="director">디렉터만</option>
          <option value="admin">관리자만</option>
        </select>
        <select className={styles.filterSelect} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}>
          <option value="all">모든 기수</option>
          <option value="1">1기</option>
          <option value="2">2기</option>
          <option value="3">3기</option>
          <option value="4">4기</option>
          <option value="none">기수 없음</option>
        </select>
        <select className={styles.filterSelect} value={filterInstrument} onChange={(e) => setFilterInstrument(e.target.value)}>
          <option value="all">모든 악기</option>
          <option value="바이올린">바이올린</option>
          <option value="비올라">비올라</option>
          <option value="첼로">첼로</option>
          <option value="콘트라베이스">콘트라베이스</option>
          <option value="플루트">플루트</option>
          <option value="클라리넷">클라리넷</option>
          <option value="none">악기 없음</option>
        </select>
      </div>

      <div className={styles.tableContainer} style={{ position: 'relative' }}>
        
        {feedback && (
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            padding: '12px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
            backgroundColor: feedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: feedback.type === 'success' ? '#047857' : '#b91c1c',
            border: `1px solid ${feedback.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease'
          }}>
            {feedback.message}
          </div>
        )}

        <table className={styles.table}>
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>권한</th>
              <th>기수</th>
              <th>악기</th>
              <th>가입일</th>
              <th style={{ textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {/* 🔍 [수정됨] users 대신 filteredUsers 매핑 */}
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role.toLowerCase()}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={loadingId === u.id}
                    className={`${styles.roleSelect} ${getRoleBadgeClass(u.role)}`}
                  >
                    <option value="admin">관리자</option>
                    <option value="director">디렉터</option>
                    <option value="teacher">선생님</option>
                    <option value="student">학생</option>
                  </select>
                  {loadingId === u.id && <span style={{ marginLeft: 8, fontSize: 12 }}>⏳</span>}
                </td>
                <td>{u.cohort ? `${u.cohort}기` : '-'}</td>
                <td>{u.instrument || '-'}</td>
                <td>{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button 
                    className={styles.deleteBtn}
                    style={{ color: '#0ea5e9', marginRight: '4px' }}
                    onClick={() => handleResetPassword(u.id)}
                    disabled={loadingId === u.id}
                  >
                    비번 초기화
                  </button>
                  <button 
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(u.id, u.name)}
                    disabled={loadingId === u.id}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                  조건에 맞는 단원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 수동 추가 모달 */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>새 단원 추가</h2>
            <form onSubmit={handleCreateUser}>
              <div className={styles.formGroup}>
                <label>이메일</label>
                <input 
                  type="email" 
                  required 
                  placeholder="example@email.com"
                  value={newMember.email}
                  onChange={e => setNewMember({...newMember, email: e.target.value})}
                />
              </div>
              <div className={styles.formGroup}>
                <label>비밀번호 (초기)</label>
                <input 
                  type="password" 
                  required 
                  minLength={6}
                  placeholder="최소 6자리 이상"
                  value={newMember.password}
                  onChange={e => setNewMember({...newMember, password: e.target.value})}
                />
              </div>
              <div className={styles.formGroup}>
                <label>이름 (실명)</label>
                <input 
                  type="text" 
                  required 
                  placeholder="홍길동"
                  value={newMember.name}
                  onChange={e => setNewMember({...newMember, name: e.target.value})}
                />
              </div>

              <div className={styles.formGroup}>
                <label>기수</label>
                <select 
                  value={newMember.cohort}
                  onChange={e => setNewMember({...newMember, cohort: e.target.value})}
                >
                  <option value="">선택 안 함 (관리자 등)</option>
                  <option value="1">1기</option>
                  <option value="2">2기</option>
                  <option value="3">3기</option>
                  <option value="4">4기</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>악기 파트</label>
                <select 
                  value={newMember.instrument}
                  onChange={e => setNewMember({...newMember, instrument: e.target.value})}
                >
                  <option value="">선택 안 함</option>
                  <option value="바이올린">바이올린</option>
                  <option value="비올라">비올라</option>
                  <option value="첼로">첼로</option>
                  <option value="콘트라베이스">콘트라베이스</option>
                  <option value="플루트">플루트</option>
                  <option value="클라리넷">클라리넷</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>권한</label>
                <select 
                  value={newMember.role}
                  onChange={e => setNewMember({...newMember, role: e.target.value})}
                >
                  <option value="student">학생 (Student)</option>
                  <option value="teacher">선생님 (Teacher)</option>
                  <option value="director">디렉터 (Director)</option>
                  <option value="admin">관리자 (Admin)</option>
                </select>
              </div>

              <div className={styles.modalActions}>
                <button 
                  type="button" 
                  className={styles.secondaryBtn} 
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                  style={{ justifyContent: 'center' }}
                >
                  {isSubmitting ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}