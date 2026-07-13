'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './scores-manage.module.css'

export default function ScoresManagementPage() {
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<any[]>([])
  const [userRole, setUserRole] = useState('')

  // 입력 폼 상태
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [cohort, setCohort] = useState('')
  const [instrument, setInstrument] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  // 관리자만 악보 등록/삭제 가능. 옵저버(director)는 열람만.
  const isAdmin = userRole === 'admin'

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
      setUserRole(me?.role || '')
    }
    await fetchScores()
  }

  const fetchScores = async () => {
    const { data } = await supabase.from('scores').select('*').order('created_at', { ascending: false })
    setScores(data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return alert('악보 PDF 파일을 선택해주세요.')
    setIsSubmitting(true)

    try {
      // 1. Storage에 파일 업로드
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('scores')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // 2. 파일 공용 주소 추출
      const { data: { publicUrl } } = supabase.storage.from('scores').getPublicUrl(fileName)

      // 3. DB 장부에 기록 저장
      const { error: dbError } = await supabase.from('scores').insert({
        title: title.trim(),
        composer: composer.trim() || null,
        cohort: cohort ? Number(cohort) : null,
        instrument: instrument || null,
        file_url: publicUrl,
        file_name: file.name
      })

      if (dbError) throw dbError

      alert('새로운 악보가 성공적으로 보관함에 등록되었습니다.')
      setTitle(''); setComposer(''); setCohort(''); setInstrument(''); setFile(null);
      // 파일 인풋 창 수동 리셋
      (document.getElementById('scoreFile') as HTMLInputElement).value = '';
      fetchScores()
    } catch (error) {
      console.error('악보 업로드 실패:', error)
      alert('업로드 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string, fileUrl: string) => {
    if (!window.confirm('정말 이 악보를 보관함에서 영구 삭제하시겠습니까?')) return
    
    try {
      // 파일 이름 추출 후 스토리지에서 삭제
      const fileName = fileUrl.split('/').pop()
      if (fileName) {
        await supabase.storage.from('scores').remove([fileName])
      }
      
      // DB 행 삭제
      await supabase.from('scores').delete().eq('id', id)
      alert('악보가 삭제되었습니다.')
      fetchScores()
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  if (loading) return <div className={styles.loading}>데이터 로딩 중...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🎼 중앙 악보 보관함{isAdmin ? ' 관리' : ''}</h1>

      <div className={styles.layout}>
        {/* 왼쪽: 업로드 폼 (관리자 전용) */}
        {isAdmin && (
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>새 악보 등록</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.label}>곡 제목 *</label>
              <input type="text" required className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 베토벤 교향곡 5번" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>작곡가</label>
              <input type="text" className={styles.input} value={composer} onChange={e => setComposer(e.target.value)} placeholder="예: L. v. Beethoven" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>대상 기수 제한 (선택)</label>
              <select className={styles.select} value={cohort} onChange={e => setCohort(e.target.value)}>
                <option value="">전체 공유 (기수 제한 없음)</option>
                <option value="1">1기 전용</option><option value="2">2기 전용</option><option value="3">3기 전용</option><option value="4">4기 전용</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>대상 악기 파트 제한 (선택)</label>
              <select className={styles.select} value={instrument} onChange={e => setInstrument(e.target.value)}>
                <option value="">총보 (Full Score / 전체공유)</option>
                <option value="바이올린">바이올린 파트보</option>
                <option value="비올라">비올라 파트보</option>
                <option value="첼로">첼로 파트보</option>
                <option value="콘트라베이스">콘트라베이스 파트보</option>
                <option value="플루트">플루트 파트보</option>
                <option value="클라리넷">클라리넷 파트보</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>악보 PDF 파일 *</label>
              <input id="scoreFile" type="file" accept="application/pdf" required onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? '업로드 중...' : '보관함에 악보 저장'}
            </button>
          </form>
        </div>
        )}

        {/* 오른쪽: 악보 보관 목록 */}
        <div className={styles.listSection} style={!isAdmin ? { width: '100%' } : undefined}>
          <h2 className={styles.sectionTitle}>현재 보관 중인 악보 ({scores.length}개)</h2>
          {scores.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#a0aec0', padding: '40px 0' }}>보관함이 비어있습니다.</div>
          ) : (
            scores.map(score => (
              <div key={score.id} className={styles.scoreRow}>
                <div className={styles.scoreInfo}>
                  <span className={styles.scoreTitle}>{score.title}</span>
                  <div className={styles.meta}>
                    <span>👤 {score.composer || '미상'}</span>
                    <span>•</span>
                    <span style={{ color: '#00A99D', fontWeight: 'bold' }}>{score.cohort ? `${score.cohort}기` : '공용'}</span>
                    <span>•</span>
                    <span style={{ color: '#4a5568' }}>{score.instrument || '총보'}</span>
                  </div>
                </div>
                {isAdmin && (
                  <button className={styles.deleteBtn} onClick={() => handleDelete(score.id, score.file_url)}>삭제</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}