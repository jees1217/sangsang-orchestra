'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SUBSTITUTION_REASONS, SUBSTITUTION_STATUS,
  type SubstitutionReason, type SubstitutionStatus,
} from '@/lib/substitution'
import styles from './substitutions.module.css'

interface Row {
  id: string
  student_id: string
  reason: SubstitutionReason
  reason_detail: string | null
  document_path: string | null
  document_name: string | null
  status: SubstitutionStatus
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  term_key: string
  student: { name: string; cohort: number | null } | null
  schedule: { title: string; schedule_date: string; start_time: string } | null
  reviewer: { name: string } | null
}

// 기수 키(예: '2026-2027') → '2026.6 ~ 2027.5'
const termLabel = (key: string) => {
  const [a, b] = key.split('-')
  return `${a}.6 ~ ${b}.5`
}

type Filter = 'all' | SubstitutionStatus

export default function SubstitutionsReviewPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [busyId, setBusyId] = useState('')

  // 기수 증빙 정리 (관리자 전용)
  const [showCleanup, setShowCleanup] = useState(false)
  const [cleanupTerm, setCleanupTerm] = useState('')
  const [cleaning, setCleaning] = useState(false)

  const isAdmin = role === 'admin'

  useEffect(() => { init() }, [])

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
      setRole(me?.role || '')

      const { data } = await supabase
        .from('attendance_substitutions')
        .select('id, student_id, reason, reason_detail, document_path, document_name, status, review_note, reviewed_at, created_at, term_key, student:student_id(name, cohort), schedule:schedule_id(title, schedule_date, start_time), reviewer:reviewed_by(name)')
        .order('created_at', { ascending: false })
      setRows((data as any) || [])
    } catch (error) {
      console.error('출석 대체 신청 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const viewDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from('substitution-docs').createSignedUrl(path, 120)
    if (error || !data) return alert('증빙서류를 여는 중 오류가 발생했습니다.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const review = async (row: Row, status: 'approved' | 'rejected') => {
    if (status === 'rejected') {
      const note = window.prompt('반려 사유를 입력해주세요. (학생에게 표시됩니다)')
      if (note === null) return
      await applyReview(row, status, note.trim() || '사유 미기재')
    } else {
      if (!row.document_path && !window.confirm('증빙서류가 아직 제출되지 않았습니다. 그래도 승인하시겠습니까?')) return
      await applyReview(row, status, null)
    }
  }

  const applyReview = async (row: Row, status: 'approved' | 'rejected', note: string | null) => {
    setBusyId(row.id)
    try {
      const { error } = await supabase.from('attendance_substitutions')
        .update({ status, review_note: note, reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      init()
    } catch (error) {
      console.error('심사 처리 실패:', error)
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setBusyId('')
    }
  }

  // 기수별 증빙 정리: 이 기수의 증빙 이미지만 일괄 삭제 (신청 내역은 유지)
  const handleTermCleanup = async () => {
    const targets = rows.filter(r => r.term_key === cleanupTerm && r.document_path)
    if (targets.length === 0) return alert('해당 기수에 삭제할 증빙이 없습니다.')
    if (!window.confirm(
      `${termLabel(cleanupTerm)} 기수의 증빙서류 ${targets.length}건을 영구 삭제합니다.\n` +
      `신청 내역(사유·처리결과)은 그대로 남습니다. 계속할까요?`,
    )) return

    setCleaning(true)
    try {
      const paths = targets.map(r => r.document_path!)
      const { error: rmErr } = await supabase.storage.from('substitution-docs').remove(paths)
      if (rmErr) throw rmErr

      const { error: upErr } = await supabase.from('attendance_substitutions')
        .update({ document_path: null, document_name: null, document_submitted_at: null })
        .in('id', targets.map(r => r.id))
      if (upErr) throw upErr

      alert(`증빙서류 ${targets.length}건이 삭제되었습니다.`)
      setCleanupTerm('')
      init()
    } catch (error) {
      console.error('기수 증빙 정리 실패:', error)
      alert('정리 중 오류가 발생했습니다.')
    } finally {
      setCleaning(false)
    }
  }

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })

  const filtered = rows.filter(r => filter === 'all' || r.status === filter)
  const pendingCount = rows.filter(r => r.status === 'pending').length

  // 기수별 증빙 보유 현황 (최신 기수 우선)
  const termStats = Object.values(
    rows.reduce((acc, r) => {
      if (!acc[r.term_key]) acc[r.term_key] = { term: r.term_key, docs: 0 }
      if (r.document_path) acc[r.term_key].docs++
      return acc
    }, {} as Record<string, { term: string; docs: number }>),
  ).sort((a, b) => b.term.localeCompare(a.term))

  if (loading) return <div className={styles.loading}>불러오는 중...</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🙋 출석 대체 신청 {isAdmin ? '관리' : '현황'}</h1>
          <p className={styles.subtitle}>
            {isAdmin ? '병가·대회 등 결석 인정 신청을 검토하고 승인/반려합니다.' : '결석 인정 신청 현황을 조회합니다. (승인 권한은 관리자에게 있습니다)'}
          </p>
        </div>
        {pendingCount > 0 && <span className={styles.pendingChip}>심사 대기 {pendingCount}건</span>}
      </div>

      <div className={styles.tabBar}>
        {([['pending', '심사 대기'], ['approved', '승인'], ['rejected', '반려'], ['all', '전체']] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${filter === key ? styles.tabActive : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>해당하는 신청이 없습니다.</div>
      ) : (
        <div className={styles.list}>
          {filtered.map(row => {
            const st = SUBSTITUTION_STATUS[row.status]
            return (
              <div key={row.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.badge} style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  <span className={styles.studentName}>
                    {row.student?.name || '알 수 없음'}
                    {row.student?.cohort ? <span className={styles.cohort}> {row.student.cohort}기</span> : null}
                  </span>
                  <span className={styles.schedule}>
                    {row.schedule ? `${fmtDate(row.schedule.schedule_date)} ${row.schedule.start_time?.substring(0, 5)} · ${row.schedule.title}` : '(삭제된 수업)'}
                  </span>
                </div>

                <div className={styles.itemBody}>
                  <span className={styles.reason}>{SUBSTITUTION_REASONS[row.reason].icon} {SUBSTITUTION_REASONS[row.reason].label}</span>
                  {row.reason_detail && <span className={styles.detail}>{row.reason_detail}</span>}
                </div>

                {row.status === 'rejected' && row.review_note && (
                  <div className={styles.rejectNote}>반려 사유: {row.review_note}</div>
                )}
                {row.status !== 'pending' && row.reviewer && (
                  <div className={styles.reviewerMeta}>
                    {row.reviewer.name} · {row.reviewed_at ? new Date(row.reviewed_at).toLocaleDateString('ko-KR') : ''}
                  </div>
                )}

                <div className={styles.itemFoot}>
                  {row.document_path ? (
                    <button className={styles.docBtn} onClick={() => viewDoc(row.document_path!)}>
                      📎 증빙 보기{row.document_name ? ` · ${row.document_name}` : ''}
                    </button>
                  ) : (
                    <span className={styles.docMissing}>증빙 미제출</span>
                  )}

                  {isAdmin && row.status === 'pending' && (
                    <div className={styles.actions}>
                      <button className={styles.rejectBtn} disabled={busyId === row.id} onClick={() => review(row, 'rejected')}>반려</button>
                      <button className={styles.approveBtn} disabled={busyId === row.id} onClick={() => review(row, 'approved')}>승인</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 기수별 증빙 정리 (관리자 전용) ── */}
      {isAdmin && (
        <div className={styles.cleanup}>
          <button className={styles.cleanupToggle} onClick={() => setShowCleanup(v => !v)}>
            🗂 기수별 증빙 정리 {showCleanup ? '▲' : '▼'}
          </button>
          {showCleanup && (
            <div className={styles.cleanupBody}>
              <p className={styles.cleanupHint}>
                기수(6월~차기 5월)가 끝나면 해당 기수의 증빙 이미지를 일괄 삭제해 저장공간을 정리합니다.
                신청 내역(사유·처리결과)은 그대로 보존됩니다.
              </p>
              <div className={styles.cleanupRow}>
                <select
                  className={styles.select}
                  style={{ maxWidth: 260 }}
                  value={cleanupTerm}
                  onChange={e => setCleanupTerm(e.target.value)}
                >
                  <option value="">정리할 기수를 선택하세요</option>
                  {termStats.map(t => (
                    <option key={t.term} value={t.term} disabled={t.docs === 0}>
                      {termLabel(t.term)} · 증빙 {t.docs}건
                    </option>
                  ))}
                </select>
                <button
                  className={styles.cleanupBtn}
                  disabled={!cleanupTerm || cleaning}
                  onClick={handleTermCleanup}
                >
                  {cleaning ? '삭제 중...' : '이 기수 증빙 일괄 삭제'}
                </button>
              </div>
              {termStats.length === 0 && <p className={styles.cleanupHint}>아직 신청 내역이 없습니다.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
