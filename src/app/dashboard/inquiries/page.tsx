'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './inquiries.module.css'

// 문의게시판
// - 열람: 모든 계정
// - 작성/수정/삭제/비밀글: 옵저버(director) 제외
// - 수정은 언제나 본인 글만. 삭제·비밀글 지정은 본인 글 + 관리자는 전체.
// - 답변은 관리자만 작성. 수정은 본인 답변만, 삭제는 관리자면 전부.
// 권한 판정은 화면과 별개로 RLS/트리거(00024·00025 마이그레이션)에서도 동일하게 강제된다.
export default function InquiriesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [inquiries, setInquiries] = useState<any[]>([])
  const [repliesByInquiry, setRepliesByInquiry] = useState<Record<string, any[]>>({})
  const [userMap, setUserMap] = useState<Record<string, string>>({})

  // 작성 폼 — '글쓰기' 버튼을 눌렀을 때만 펼친다
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // 답변 (관리자 전용)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [submittingReplyFor, setSubmittingReplyFor] = useState<string | null>(null)
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null)
  const [editReplyContent, setEditReplyContent] = useState('')
  const [savingReply, setSavingReply] = useState(false)

  // 펼쳐보기/접기 — 기본은 제목만(접힘). 여기 있는 id만 본문이 펼쳐진다.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const supabase = createClient()

  useEffect(() => { fetchInitialData() }, [])

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase.from('users').select('role, name').eq('id', user.id).single()
      if (!userData) return

      setCurrentUser({ id: user.id, name: userData.name })
      setUserRole(userData.role)

      const { data: uData } = await supabase.from('users').select('id, name')
      const map: Record<string, string> = {}
      ;(uData || []).forEach((u: any) => { map[u.id] = u.name })
      setUserMap(map)

      await fetchInquiries()
    } catch (error) {
      console.error('데이터 로딩 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 목록은 항상 inquiries_board 뷰에서 읽는다.
  // 비밀글은 뷰가 본문(content)을 서버에서 제거하고 can_read_content=false 로 내려준다.
  // 답변은 RLS가 "원글을 볼 수 있는 사람"에게만 내려주므로, 안 보이는 비밀글의 답변은 애초에 오지 않는다.
  const fetchInquiries = async () => {
    const [{ data, error }, { data: replyData, error: replyError }] = await Promise.all([
      supabase.from('inquiries_board').select('*').order('created_at', { ascending: false }),
      supabase.from('inquiry_replies').select('*').order('created_at', { ascending: true }),
    ])
    if (error) console.error('문의 조회 오류:', error.message, error.code)
    if (replyError) console.error('답변 조회 오류:', replyError.message, replyError.code)

    const grouped: Record<string, any[]> = {}
    ;(replyData || []).forEach((r: any) => {
      ;(grouped[r.inquiry_id] ||= []).push(r)
    })
    setInquiries(data || [])
    setRepliesByInquiry(grouped)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해주세요.')
    setIsSubmitting(true)
    try {
      const { error } = await supabase.from('inquiries').insert({
        writer_id: currentUser.id,
        title: title.trim(),
        content: content.trim(),
        is_secret: isSecret,
      })
      if (error) throw error
      setTitle(''); setContent(''); setIsSecret(false)
      setShowForm(false)
      await fetchInquiries()
    } catch (error) {
      console.error('등록 실패:', error)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isOwner = (item: any) => item.writer_id === currentUser?.id
  const isObserver = userRole === 'director'
  const isAdmin = userRole === 'admin'
  // 수정은 본인 글만 (관리자도 남의 글은 수정 불가)
  const canEdit = (item: any) => !isObserver && isOwner(item)
  // 삭제·비밀글 지정은 본인 글 + 관리자는 전체
  const canManage = (item: any) => !isObserver && (isOwner(item) || userRole === 'admin')

  const startEdit = (item: any) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditContent(item.content ?? '')
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (item: any) => {
    if (!editTitle.trim() || !editContent.trim()) return alert('제목과 내용을 입력해주세요.')
    setSavingEdit(true)
    try {
      const { error } = await supabase
        .from('inquiries')
        .update({ title: editTitle.trim(), content: editContent.trim() })
        .eq('id', item.id)
      if (error) throw error
      setEditingId(null)
      await fetchInquiries()
    } catch (error) {
      console.error('수정 실패:', error)
      alert('수정 중 오류가 발생했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleSecret = async (item: any) => {
    const { error } = await supabase
      .from('inquiries')
      .update({ is_secret: !item.is_secret })
      .eq('id', item.id)
    if (error) {
      console.error('비밀글 설정 실패:', error)
      alert('비밀글 설정 중 오류가 발생했습니다.')
      return
    }
    await fetchInquiries()
  }

  // ── 답변 (관리자 전용) ──
  const submitReply = async (inquiryId: string) => {
    const draft = (replyDrafts[inquiryId] || '').trim()
    if (!draft) return alert('답변 내용을 입력해주세요.')
    setSubmittingReplyFor(inquiryId)
    try {
      const { error } = await supabase.from('inquiry_replies').insert({
        inquiry_id: inquiryId,
        writer_id: currentUser.id,
        content: draft,
      })
      if (error) throw error
      setReplyDrafts(prev => ({ ...prev, [inquiryId]: '' }))
      await fetchInquiries()
    } catch (error) {
      console.error('답변 등록 실패:', error)
      alert('답변 등록 중 오류가 발생했습니다.')
    } finally {
      setSubmittingReplyFor(null)
    }
  }

  const startEditReply = (reply: any) => {
    setEditingReplyId(reply.id)
    setEditReplyContent(reply.content)
  }

  const cancelEditReply = () => setEditingReplyId(null)

  const saveEditReply = async (reply: any) => {
    if (!editReplyContent.trim()) return alert('답변 내용을 입력해주세요.')
    setSavingReply(true)
    try {
      const { error } = await supabase
        .from('inquiry_replies')
        .update({ content: editReplyContent.trim() })
        .eq('id', reply.id)
      if (error) throw error
      setEditingReplyId(null)
      await fetchInquiries()
    } catch (error) {
      console.error('답변 수정 실패:', error)
      alert('답변 수정 중 오류가 발생했습니다.')
    } finally {
      setSavingReply(false)
    }
  }

  const deleteReply = async (reply: any) => {
    if (!window.confirm('이 답변을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('inquiry_replies').delete().eq('id', reply.id)
    if (error) {
      console.error('답변 삭제 실패:', error)
      alert('답변 삭제 중 오류가 발생했습니다.')
      return
    }
    await fetchInquiries()
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(inquiries.map((i: any) => i.id)))
  const collapseAll = () => setExpandedIds(new Set())

  const handleDelete = async (item: any) => {
    if (!window.confirm('이 문의글을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.')) return
    const { error } = await supabase.from('inquiries').delete().eq('id', item.id)
    if (error) {
      console.error('삭제 실패:', error)
      alert('삭제 중 오류가 발생했습니다.')
      return
    }
    await fetchInquiries()
  }

  if (loading) return <div className={styles.loading}>페이지를 불러오는 중입니다...</div>

  const list = (
    <div className={styles.listSection}>
      <div className={styles.listHeader}>
        <h2 className={styles.sectionTitle}>문의 목록</h2>
        {inquiries.length > 0 && (
          <div className={styles.bulkToggle}>
            <button type="button" onClick={expandAll} className={styles.bulkBtn}>전체 펼치기</button>
            <button type="button" onClick={collapseAll} className={styles.bulkBtn}>전체 접기</button>
          </div>
        )}
      </div>
      {inquiries.length === 0 ? (
        <div className={styles.empty}>등록된 문의가 없습니다.</div>
      ) : (
        inquiries.map(item => {
          const replies = repliesByInquiry[item.id] || []
          // 수정 중인 글은 접혀 있어도 강제로 펼쳐 보인다
          const isExpanded = expandedIds.has(item.id) || editingId === item.id
          return (
          <div key={item.id} className={`${styles.card} ${item.is_secret ? styles.cardSecret : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.badges}>
                {item.is_secret && <span className={styles.badgeSecret}>🔒 비밀글</span>}
                {isOwner(item) && <span className={styles.badgeMine}>내 글</span>}
                {item.can_read_content && (
                  replies.length > 0
                    ? <span className={styles.badgeAnswered}>답변완료 {replies.length}</span>
                    : <span className={styles.badgePending}>미답변</span>
                )}
              </div>
              {editingId !== item.id && (
                <div className={styles.cardActions}>
                  {canEdit(item) && (
                    <button type="button" onClick={() => startEdit(item)} className={styles.editBtn}>수정</button>
                  )}
                  {canManage(item) && (
                    <button type="button" onClick={() => toggleSecret(item)} className={styles.secretBtn}>
                      {item.is_secret ? '공개로 전환' : '비밀글로 전환'}
                    </button>
                  )}
                  {canManage(item) && (
                    <button type="button" onClick={() => handleDelete(item)} className={styles.deleteBtn}>삭제</button>
                  )}
                </div>
              )}
            </div>

            {editingId === item.id ? (
              <div className={styles.editForm}>
                <input
                  type="text" className={styles.input} value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)} placeholder="제목을 입력하세요"
                />
                <textarea
                  className={styles.textarea} value={editContent}
                  onChange={(e) => setEditContent(e.target.value)} placeholder="문의 내용을 작성해주세요"
                />
                <div className={styles.editActions}>
                  <button type="button" onClick={cancelEdit} className={styles.cancelBtn}>취소</button>
                  <button type="button" onClick={() => saveEdit(item)} disabled={savingEdit} className={styles.saveBtn}>
                    {savingEdit ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.cardTitleToggle}
                  onClick={() => toggleExpand(item.id)}
                  aria-expanded={isExpanded}
                >
                  <span className={styles.toggleArrow}>{isExpanded ? '▼' : '▶'}</span>
                  <h3 className={styles.cardTitle}>{item.title}</h3>
                </button>
                {isExpanded && (
                  item.can_read_content ? (
                    <div className={styles.cardContent}>{item.content}</div>
                  ) : (
                    <div className={styles.lockedContent}>🔒 비밀글입니다. 작성자와 관리자만 내용을 볼 수 있습니다.</div>
                  )
                )}
              </>
            )}

            <div className={styles.cardFooter}>
              <span>작성자: {userMap[item.writer_id] || '알 수 없음'}</span>
              <span>
                {new Date(item.created_at).toLocaleString('ko-KR')}
                {item.updated_at && ' (수정됨)'}
              </span>
            </div>

            {/* 답변 — 작성은 관리자만, 열람은 원글을 볼 수 있는 사람 모두. 글이 접혀 있으면 답변도 함께 숨긴다 */}
            {isExpanded && (replies.length > 0 || isAdmin) && (
              <div className={styles.replySection}>
                {replies.map(reply => (
                  <div key={reply.id} className={styles.reply}>
                    <div className={styles.replyHeader}>
                      <span className={styles.replyLabel}>↳ 관리자 답변</span>
                      {isAdmin && editingReplyId !== reply.id && (
                        <div className={styles.cardActions}>
                          {reply.writer_id === currentUser?.id && (
                            <button type="button" onClick={() => startEditReply(reply)} className={styles.editBtn}>수정</button>
                          )}
                          <button type="button" onClick={() => deleteReply(reply)} className={styles.deleteBtn}>삭제</button>
                        </div>
                      )}
                    </div>

                    {editingReplyId === reply.id ? (
                      <div className={styles.editForm}>
                        <textarea
                          className={styles.textarea} value={editReplyContent}
                          onChange={(e) => setEditReplyContent(e.target.value)} placeholder="답변 내용을 입력하세요"
                        />
                        <div className={styles.editActions}>
                          <button type="button" onClick={cancelEditReply} className={styles.cancelBtn}>취소</button>
                          <button type="button" onClick={() => saveEditReply(reply)} disabled={savingReply} className={styles.saveBtn}>
                            {savingReply ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.replyContent}>{reply.content}</div>
                    )}

                    <div className={styles.replyFooter}>
                      <span>{userMap[reply.writer_id] || '관리자'}</span>
                      <span>
                        {new Date(reply.created_at).toLocaleString('ko-KR')}
                        {reply.updated_at && ' (수정됨)'}
                      </span>
                    </div>
                  </div>
                ))}

                {isAdmin && (
                  <div className={styles.replyForm}>
                    <textarea
                      className={styles.replyTextarea}
                      value={replyDrafts[item.id] || ''}
                      onChange={(e) => setReplyDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="답변을 입력하세요"
                    />
                    <button
                      type="button" onClick={() => submitReply(item.id)}
                      disabled={submittingReplyFor === item.id} className={styles.replyBtn}
                    >
                      {submittingReplyFor === item.id ? '등록 중...' : '답변 등록'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )
        })
      )}
    </div>
  )

  // 옵저버: 열람 전용 — 작성 폼 없이 목록만
  if (isObserver) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>문의게시판</h1>
        <div className={styles.observerNote}>옵저버 계정은 문의글을 열람만 할 수 있습니다.</div>
        {list}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>문의게시판</h1>
        {!showForm && (
          <button type="button" className={styles.writeBtn} onClick={() => setShowForm(true)}>
            ✏️ 글쓰기
          </button>
        )}
      </div>

      {showForm && (
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>새 문의 작성</h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.label}>제목</label>
              <input
                type="text" required className={styles.input} value={title}
                onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력하세요"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>내용</label>
              <textarea
                required className={styles.textarea} value={content}
                onChange={(e) => setContent(e.target.value)} placeholder="문의 내용을 작성해주세요"
              />
            </div>

            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} />
              🔒 비밀글로 작성 (작성자와 관리자만 열람)
            </label>

            <div className={styles.formActions}>
              <button
                type="button" className={styles.cancelBtn}
                onClick={() => { setShowForm(false); setTitle(''); setContent(''); setIsSecret(false) }}
              >
                취소
              </button>
              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? '등록 중...' : '문의 등록'}
              </button>
            </div>
          </form>
        </div>
      )}

      {list}
    </div>
  )
}
