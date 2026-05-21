'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'

export default function ProfilePage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')
        
        const { data: userData } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single()
          
        if (userData) {
          setName(userData.name || '')
        }
      }
      setIsLoading(false)
    }
    
    fetchUser()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFeedback(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('인증된 유저가 없습니다.')

      const authUpdates: any = {}
      
      // [개선] 이메일 변경 로직은 완전히 삭제하여 에러 원천 차단!
      
      // 새 비밀번호가 입력되었을 때만 검증 후 바구니에 수집
      if (newPassword && newPassword.trim() !== '') {
        if (newPassword.length < 6) {
          throw new Error('비밀번호는 최소 6자리 이상이어야 합니다.')
        }
        if (newPassword !== confirmNewPassword) {
          throw new Error('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.')
        }
        authUpdates.password = newPassword.trim()
      }

      // 1. Auth 업데이트 (비밀번호 변경이 있을 때만 수파베이스 보안실 호출)
      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(authUpdates)
        if (authError) throw authError
      }

      // 2. public.users 테이블 이름 업데이트 (이름은 상시 동기화)
      const { error: dbError } = await supabase
        .from('users')
        .update({ name: name.trim() })
        .eq('id', user.id)

      if (dbError) throw dbError

      setFeedback({ message: '프로필이 성공적으로 업데이트되었습니다.', type: 'success' })
      setNewPassword('') 
      setConfirmNewPassword('')
      
      setTimeout(() => setFeedback(null), 3000)
    } catch (err: any) {
      console.error('프로필 업데이트 에러:', err)
      setFeedback({ message: err.message || '프로필 업데이트에 실패했습니다.', type: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className={styles.loading}>로딩 중...</div>
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>내 프로필 수정</h1>
      
      {feedback && (
        <div className={`${styles.feedback} ${styles[feedback.type]}`}>
          {feedback.message}
        </div>
      )}

      <div className={styles.card}>
        <form onSubmit={handleSubmit} className={styles.form}>
          
          {/* [수정] 이메일(아이디) 칸을 읽기 전용 회색창으로 변경하여 고정 */}
          <div className={styles.formGroup}>
            <label>아이디 (변경 불가)</label>
            <input 
              type="text" 
              disabled 
              value={email}
              className={styles.input}
              style={{ backgroundColor: '#f5f5f5', color: '#888', cursor: 'not-allowed' }}
            />
          </div>

          <div className={styles.formGroup}>
            <label>이름</label>
            <input 
              type="text" 
              required 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label>새 비밀번호</label>
            <input 
              type="password" 
              placeholder="변경할 때만 입력하세요 (최소 6자리)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.formGroup}>
            <label>새 비밀번호 확인</label>
            <input 
              type="password" 
              placeholder="새 비밀번호를 다시 입력하세요"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
          </div>

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '변경사항 저장'}
          </button>
        </form>
      </div>
    </div>
  )
}