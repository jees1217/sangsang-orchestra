'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compressImage'
import {
  SUBSTITUTION_REASONS, SUBSTITUTION_STATUS, MAX_DOC_BYTES, DOC_ACCEPT,
  termKeyForDate, type SubstitutionReason, type SubstitutionStatus,
} from '@/lib/substitution'
import styles from './substitutions.module.css'

interface Schedule {
  id: string
  title: string
  schedule_type: string
  schedule_date: string
  start_time: string
}

interface Substitution {
  id: string
  schedule_id: string
  reason: SubstitutionReason
  reason_detail: string | null
  document_path: string | null
  document_name: string | null
  status: SubstitutionStatus
  review_note: string | null
  created_at: string
  schedule: { title: string; schedule_date: string; start_time: string } | null
}

export default function StudentSubstitutionsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [requests, setRequests] = useState<Substitution[]>([])

  // 신청 폼
  const [scheduleId, setScheduleId] = useState('')
  const [reason, setReason] = useState<SubstitutionReason>('medical')
  const [detail, setDetail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: student } = await supabase
        .from('users').select('cohort, class_id').eq('id', user.id).single()
      if (!student) return

      // 신청 가능한 수업: 최근 14일 전 ~ 미래 (막 놓친 수업도 신청 가능하도록)
      const from = new Date(); from.setDate(from.getDate() - 14)
      const fromStr = from.toISOString().split('T')[0]

      const [{ data: allSchedules }, { data: myRequests }] = await Promise.all([
        supabase.from('schedules')
          .select('id, title, schedule_type, schedule_date, start_time, target_type, target_cohort, target_class_id, target_user_id')
          .gte('schedule_date', fromStr)
          .order('schedule_date', { ascending: true }),
        supabase.from('attendance_substitutions')
          .select('id, schedule_id, reason, reason_detail, document_path, document_name, status, review_note, created_at, schedule:schedule_id(title, schedule_date, start_time)')
          .eq('student_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      const mine = (allSchedules || []).filter((sc: any) => {
        if (sc.target_type === 'all') return true
        if (sc.target_type === 'cohort' && sc.target_cohort === student.cohort) return true
        if (sc.target_type === 'class' && sc.target_class_id === student.class_id) return true
        if (sc.target_type === 'individual' && sc.target_user_id === user.id) return true
        return false
      })

      setRequests((myRequests as any) || [])

      // 이미 신청한 수업은 목록에서 제외 (수업당 1건)
      const usedIds = new Set((myRequests || []).map((r: any) => r.schedule_id))
      setSchedules(mine.filter((sc: any) => !usedIds.has(sc.id)))
    } catch (error) {
      console.error('출석 대체 신청 데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 파일 업로드 → 저장 경로 반환
  const uploadDoc = async (raw: File): Promise<{ path: string; name: string }> => {
    const prepared = await compressImage(raw)
    if (prepared.size > MAX_DOC_BYTES) {
      throw new Error(`파일이 너무 큽니다. ${Math.round(MAX_DOC_BYTES / 1024 / 1024)}MB 이하로 올려주세요.`)
    }
    const ext = prepared.name.split('.').pop() || 'dat'
    const path = `${userId}/${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`
    const { error } = await supabase.storage.from('substitution-docs').upload(path, prepared, { upsert: true })
    if (error) throw error
    return { path, name: raw.name }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduleId) return alert('결석할 수업을 선택해주세요.')
    setSubmitting(true)
    try {
      const schedule = schedules.find(s => s.id === scheduleId)
      let doc: { path: string; name: string } | null = null
      if (file) doc = await uploadDoc(file)

      const { error } = await supabase.from('attendance_substitutions').insert({
        student_id: userId,
        schedule_id: scheduleId,
        reason,
        reason_detail: detail.trim() || null,
        document_path: doc?.path ?? null,
        document_name: doc?.name ?? null,
        document_submitted_at: doc ? new Date().toISOString() : null,
        term_key: termKeyForDate(schedule!.schedule_date),
      })
      if (error) throw error

      alert('출석 대체 신청이 접수되었습니다.' + (doc ? '' : '\n증빙서류는 나중에 아래 목록에서 제출할 수 있습니다.'))
      setScheduleId(''); setReason('medical'); setDetail(''); setFile(null)
      const fileInput = document.getElementById('subFile') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
      init()
    } catch (error: any) {
      console.error('출석 대체 신청 실패:', error)
      alert(error?.message || '신청 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // 추후 증빙 제출 (기존 신청에 서류 첨부)
  const handleLateDoc = async (req: Substitution, raw: File) => {
    try {
      const doc = await uploadDoc(raw)
      const { error } = await supabase.from('attendance_substitutions')
        .update({ document_path: doc.path, document_name: doc.name, document_submitted_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      alert('증빙서류가 제출되었습니다.')
      init()
    } catch (error: any) {
      console.error('증빙 제출 실패:', error)
      alert(error?.message || '증빙 제출 중 오류가 발생했습니다.')
    }
  }

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })

  if (loading) return <div className={styles.loading}>불러오는 중...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🙋 출석 대체 신청</h1>
      <p className={styles.subtitle}>
        병가나 대회 등 피치 못할 사정으로 결석할 때, 사유와 증빙서류를 제출해 인정받을 수 있습니다.
        증빙서류는 나중에 제출해도 됩니다.
      </p>

      {/* ── 신청 폼 ── */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>새 신청서 작성</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>결석할 수업 *</label>
            <select className={styles.select} value={scheduleId} onChange={e => setScheduleId(e.target.value)} required>
              <option value="">수업을 선택하세요</option>
              {schedules.map(sc => (
                <option key={sc.id} value={sc.id}>
                  {fmtDate(sc.schedule_date)} {sc.start_time?.substring(0, 5)} · {sc.title}
                </option>
              ))}
            </select>
            {schedules.length === 0 && (
              <p className={styles.hint}>신청 가능한 수업이 없습니다. (이미 신청했거나 예정된 수업이 없어요)</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>결석 사유 *</label>
            <div className={styles.reasonRow}>
              {(Object.keys(SUBSTITUTION_REASONS) as SubstitutionReason[]).map(key => (
                <button
                  type="button"
                  key={key}
                  className={`${styles.reasonBtn} ${reason === key ? styles.reasonBtnActive : ''}`}
                  onClick={() => setReason(key)}
                >
                  {SUBSTITUTION_REASONS[key].icon} {SUBSTITUTION_REASONS[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>상세 사유 (선택)</label>
            <textarea
              className={styles.textarea}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="예: OO병원 입원 (7/10~7/14), OO 콩쿠르 참가 등"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>증빙서류 (선택 · 나중에 제출 가능)</label>
            <input id="subFile" type="file" accept={DOC_ACCEPT} onChange={e => setFile(e.target.files?.[0] || null)} />
            <p className={styles.hint}>이미지(사진) 또는 PDF · 최대 10MB · 이미지는 자동으로 압축됩니다.</p>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={submitting || schedules.length === 0}>
            {submitting ? '접수 중...' : '출석 대체 신청하기'}
          </button>
        </form>
      </div>

      {/* ── 내 신청 내역 ── */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>내 신청 내역 ({requests.length})</h2>
        {requests.length === 0 ? (
          <div className={styles.empty}>아직 신청한 내역이 없습니다.</div>
        ) : (
          <ul className={styles.reqList}>
            {requests.map(req => {
              const st = SUBSTITUTION_STATUS[req.status]
              const canEditDoc = req.status !== 'approved'
              return (
                <li key={req.id} className={styles.reqItem}>
                  <div className={styles.reqTop}>
                    <span className={styles.reqBadge} style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    <span className={styles.reqSchedule}>
                      {req.schedule ? `${fmtDate(req.schedule.schedule_date)} · ${req.schedule.title}` : '(삭제된 수업)'}
                    </span>
                  </div>
                  <div className={styles.reqMeta}>
                    <span>{SUBSTITUTION_REASONS[req.reason].icon} {SUBSTITUTION_REASONS[req.reason].label}</span>
                    {req.reason_detail && <span className={styles.reqDetail}>{req.reason_detail}</span>}
                  </div>

                  {req.status === 'rejected' && req.review_note && (
                    <div className={styles.reqReject}>반려 사유: {req.review_note}</div>
                  )}

                  <div className={styles.reqDocRow}>
                    {req.document_path ? (
                      <span className={styles.docOk}>📎 증빙 제출됨{req.document_name ? ` · ${req.document_name}` : ''}</span>
                    ) : (
                      <span className={styles.docMissing}>증빙 미제출</span>
                    )}
                    {canEditDoc && (
                      <label className={styles.docUploadBtn}>
                        {req.document_path ? '증빙 교체' : '증빙 제출하기'}
                        <input
                          type="file"
                          accept={DOC_ACCEPT}
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleLateDoc(req, f) }}
                        />
                      </label>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
