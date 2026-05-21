'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './scores.module.css'

export default function StudentScoresPage() {
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [scores, setScores] = useState<any[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    fetchMyScores()
  }, [])

  const fetchMyScores = async () => {
    try {
      // 1. 현재 학생의 기수(cohort)와 악기(instrument) 정보 파악
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: student } = await supabase
        .from('users')
        .select('cohort, instrument')
        .eq('id', user.id)
        .single()

      if (!student) return

      // 2. 전체 악보 목록 가져오기
      const { data: scoresData } = await supabase
        .from('scores')
        .select('*')
        .order('title', { ascending: true })

      // 3. 내 권한에 맞는 악보만 필터링 (전체 공유 악보거나, 내 기수/내 악기에 딱 맞는 악보)
      const myVisibleScores = (scoresData || []).filter(score => {
        const matchCohort = !score.cohort || score.cohort === student.cohort
        const matchInstrument = !score.instrument || score.instrument === student.instrument
        return matchCohort && matchInstrument
      })

      setScores(myVisibleScores)
    } catch (error) {
      console.error('악보 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 검색어 필터링
  const filteredScores = scores.filter(score => 
    score.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (score.composer && score.composer.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (loading) return <div className={styles.loading}>디지털 서고에서 악보를 꺼내오고 있습니다...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🎵 내 악보 보기 (디지털 보관함)</h1>

      <div className={styles.filterBar}>
        <input 
          type="text" 
          placeholder="곡 제목 또는 작곡가 이름으로 검색..." 
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredScores.length === 0 ? (
        <div className={styles.empty}>현재 연주 중이거나 열람 가능한 악보가 없습니다.</div>
      ) : (
        <div className={styles.grid}>
          {filteredScores.map((score) => (
            <div key={score.id} className={styles.scoreCard}>
              <div className={styles.cardTop}>
                <div className={styles.badgeRow}>
                  <span className={`${styles.badge} ${styles.badgePrimary}`}>
                    {score.cohort ? `${score.cohort}기 전용` : '전체 공유'}
                  </span>
                  <span className={styles.badge}>
                    {score.instrument || '총보 (Full Score)'}
                  </span>
                </div>
                <h3 className={styles.scoreTitle}>{score.title}</h3>
                <div className={styles.composer}>{score.composer || '작곡가 미상'}</div>
              </div>

              {/* 새 탭에서 PDF 바로 열기 */}
              <a 
                href={score.file_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className={styles.viewBtn}
              >
                🎼 악보 열기 (PDF)
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}