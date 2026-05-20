'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

export default function LoginPage() {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Add dummy domain for Supabase auth
      const email = `${id}@sangsang.local`
      
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        throw signInError
      }

      if (data.user) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      console.error('Login error:', err)
      setError('로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <img 
          src="/logo_sangsang.png" 
          alt="상상휠하모니오케스트라 로고" 
          className={styles.logoImage} 
        />
        <h1 className={styles.title}>상상휠하모니오케스트라</h1>
        <p className={styles.subtitle}>아이디와 비밀번호를 입력해주세요</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div className={styles.formGroup}>
            <label htmlFor="id" className={styles.label}>아이디 (ID)</label>
            <input
              id="id"
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className={styles.input}
              placeholder="아이디를 입력하세요"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
