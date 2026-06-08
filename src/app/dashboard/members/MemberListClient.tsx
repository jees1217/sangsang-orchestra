'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'

type User = {
  id: string
  email: string
  name: string
  role: string
  cohort?: number | null
  instrument?: string | null
  class_id?: string | null
  created_at: string
  guardian?: string | null
  phone?: string | null
  address?: string | null
  note?: string | null
}

interface ClassRow {
  id: string
  name: string | null
  teacher_id: string | null
  professor_id: string | null
  instructor_id: string | null
}

interface TeacherClassItem {
  classId: string
  className: string
  role: 'professor' | 'instructor'
}

interface MemberListClientProps {
  initialUsers: User[]
  viewerRole: string
}

type CsvRow = {
  rowNum: number
  name: string
  email: string
  password: string
  role: string
  cohort: string
  instrument: string
  errors: string[]
}

type ImportResult = {
  rowNum: number
  name: string
  email: string
  status: 'success' | 'error'
  message?: string
}

const roleLabels: Record<string, string> = {
  admin: '관리자', director: '디렉터', teacher: '선생님', student: '학생',
}

export default function MemberListClient({ initialUsers, viewerRole }: MemberListClientProps) {
  const [users, setUsers]         = useState<User[]>(initialUsers)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [feedback, setFeedback]   = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 검색/필터
  const [searchTerm, setSearchTerm]             = useState('')
  const [filterRole, setFilterRole]             = useState('all')
  const [filterCohort, setFilterCohort]         = useState('all')
  const [filterInstrument, setFilterInstrument] = useState('all')
  const [filterClass, setFilterClass]           = useState('all')

  // 단원 추가 모달
  const [isModalOpen, setIsModalOpen]   = useState(false)
  const [newMember, setNewMember]       = useState({ email: '', password: '', name: '', role: 'student', cohort: '4', instrument: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 반(클래스) 관련 상태
  const [allClassData, setAllClassData]       = useState<ClassRow[]>([])
  const [teacherClassMap, setTeacherClassMap] = useState<Record<string, TeacherClassItem[]>>({})

  // 클래스 관리 모달
  const [classManageOpen, setClassManageOpen] = useState(false)

  // 새 반 추가 (관리 모달 내부)
  const [createName, setCreateName]           = useState('')
  const [createTeacherId, setCreateTeacherId] = useState('')
  const [createSaving, setCreateSaving]       = useState(false)

  // 반 이름 수정 (인라인)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editSaving, setEditSaving]   = useState(false)

  // 교사 반 배정 모달
  const [classModalOpen, setClassModalOpen]       = useState(false)
  const [classModalTeacher, setClassModalTeacher] = useState<User | null>(null)
  const [classModalPending, setClassModalPending] = useState<Record<string, 'professor' | 'instructor' | 'none'>>({})
  const [classModalSaving, setClassModalSaving]   = useState(false)

  // 행 펼치기 (개인정보)
  const [expandedRows, setExpandedRows]   = useState<Set<string>>(new Set())
  const [editingPrivate, setEditingPrivate] = useState<string | null>(null)
  const [privateDraft, setPrivateDraft]   = useState({ guardian: '', phone: '', address: '', note: '' })
  const [privateSaving, setPrivateSaving] = useState(false)

  // CSV 가져오기
  const [csvRows, setCsvRows]             = useState<CsvRow[]>([])
  const [importStatus, setImportStatus]   = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [importProgress, setImportProgress] = useState(0)
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  useEffect(() => { fetchClasses() }, [])

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, teacher_id, professor_id, instructor_id')
      .order('name')
    const rows = (data || []) as ClassRow[]
    setAllClassData(rows)
    buildTeacherClassMap(rows)
  }

  const buildTeacherClassMap = (rows: ClassRow[]) => {
    const map: Record<string, TeacherClassItem[]> = {}
    rows.forEach(c => {
      const label = c.name || '(이름 없음)'
      if (c.professor_id) {
        if (!map[c.professor_id]) map[c.professor_id] = []
        map[c.professor_id].push({ classId: c.id, className: label, role: 'professor' })
      }
      if (c.instructor_id) {
        if (!map[c.instructor_id]) map[c.instructor_id] = []
        map[c.instructor_id].push({ classId: c.id, className: label, role: 'instructor' })
      }
    })
    setTeacherClassMap(map)
  }

  // ── 행 펼치기 토글 ──
  const toggleExpand = (userId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
        if (editingPrivate === userId) setEditingPrivate(null)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const openPrivateEdit = (u: User) => {
    setPrivateDraft({
      guardian: u.guardian || '',
      phone:    u.phone    || '',
      address:  u.address  || '',
      note:     u.note     || '',
    })
    setEditingPrivate(u.id)
  }

  const handleSavePrivate = async (userId: string) => {
    setPrivateSaving(true)
    try {
      const res  = await fetch('/api/users/private', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, ...privateDraft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, ...data.user } : u
      ))
      setEditingPrivate(null)
      showFeedback('개인 정보가 저장되었습니다.', 'success')
    } catch (err: any) {
      showFeedback(`저장 실패: ${err.message}`, 'error')
    } finally {
      setPrivateSaving(false)
    }
  }

  // ── CSV 파싱 헬퍼 ──
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = []
    let inQuote = false
    let current = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(current); current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  const parseCSV = (text: string): CsvRow[] => {
    const cleaned = text.replace(/^﻿/, '')
    const lines   = cleaned.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []

    const headers = parseCsvLine(lines[0]).map(h => h.trim())
    const idx = {
      name:       headers.findIndex(h => h === '이름'),
      email:      headers.findIndex(h => h === '이메일'),
      password:   headers.findIndex(h => h === '비밀번호'),
      role:       headers.findIndex(h => ['역할', 'role'].includes(h)),
      cohort:     headers.findIndex(h => ['기수', 'cohort'].includes(h)),
      instrument: headers.findIndex(h => ['악기', 'instrument'].includes(h)),
    }

    const roleMap: Record<string, string> = {
      '학생': 'student', student: 'student',
      '선생님': 'teacher', teacher: 'teacher',
      '디렉터': 'director', director: 'director',
      '관리자': 'admin', admin: 'admin',
    }

    return lines.slice(1).map((line, i) => {
      const cells = parseCsvLine(line)
      const get   = (j: number) => j >= 0 ? (cells[j] || '').trim() : ''

      const name       = get(idx.name)
      const email      = get(idx.email)
      const password   = get(idx.password) || 'sangsang1234!'
      const rawRole    = get(idx.role)
      const role       = roleMap[rawRole] || 'student'
      const cohort     = get(idx.cohort)
      const instrument = get(idx.instrument)

      const errors: string[] = []
      if (!name)  errors.push('이름 필수')
      if (!email) errors.push('이메일 필수')
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('이메일 형식 오류')
      if (password.length < 6) errors.push('비밀번호 6자 이상')

      return { rowNum: i + 2, name, email, password, role, cohort, instrument, errors }
    }).filter(row => row.name || row.email)
  }

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type })
    setTimeout(() => setFeedback(null), 3000)
  }

  const teachers = useMemo(() => users.filter(u => u.role === 'teacher'), [users])

  const getTeacherName = (teacherId: string | null) => {
    if (!teacherId) return '미배정'
    return users.find(u => u.id === teacherId)?.name ?? '알 수 없음'
  }

  // ── 필터링 ──
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch     = user.name.includes(searchTerm) || user.email.includes(searchTerm)
      const matchRole       = filterRole === 'all' || user.role === filterRole
      const matchCohort     = filterCohort === 'all' || (user.cohort?.toString() || 'none') === filterCohort
      const matchInstrument = filterInstrument === 'all' || (user.instrument || 'none') === filterInstrument
      let matchClass = true
      if (filterClass !== 'all') {
        if (user.role === 'student')      matchClass = user.class_id === filterClass
        else if (user.role === 'teacher') matchClass = (teacherClassMap[user.id] || []).some(tc => tc.classId === filterClass)
      }
      return matchSearch && matchRole && matchCohort && matchInstrument && matchClass
    })
  }, [users, searchTerm, filterRole, filterCohort, filterInstrument, filterClass, teacherClassMap])

  // ── 반 생성 ──
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = createName.trim()
    if (!trimmed || !createTeacherId) return
    setCreateSaving(true)
    try {
      const { data, error } = await supabase
        .from('classes')
        .insert({ name: trimmed, teacher_id: createTeacherId })
        .select('id, name, teacher_id, professor_id, instructor_id')
        .single()
      if (error) throw error
      const newRow = data as ClassRow
      setAllClassData(prev => [...prev, newRow].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')))
      setCreateName('')
      setCreateTeacherId('')
      showFeedback(`'${newRow.name}' 반이 생성되었습니다.`, 'success')
    } catch (err: any) {
      showFeedback(`반 생성 실패: ${err.message}`, 'error')
    } finally {
      setCreateSaving(false)
    }
  }

  // ── 반 이름 수정 ──
  const handleUpdateClassName = async (classId: string) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    setEditSaving(true)
    try {
      const { error } = await supabase
        .from('classes')
        .update({ name: trimmed })
        .eq('id', classId)
      if (error) throw error
      setAllClassData(prev =>
        prev.map(c => c.id === classId ? { ...c, name: trimmed } : c)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
      )
      buildTeacherClassMap(allClassData.map(c => c.id === classId ? { ...c, name: trimmed } : c))
      setEditingId(null)
      showFeedback('반 이름이 수정되었습니다.', 'success')
    } catch (err: any) {
      showFeedback(`수정 실패: ${err.message}`, 'error')
    } finally {
      setEditSaving(false)
    }
  }

  // ── 반 삭제 ──
  const handleDeleteClass = async (classId: string, className: string) => {
    if (!window.confirm(`'${className}' 반을 삭제하시겠습니까?\n소속 학생들의 반 배정이 해제됩니다.`)) return
    try {
      const { error } = await supabase.from('classes').delete().eq('id', classId)
      if (error) throw error
      setAllClassData(prev => prev.filter(c => c.id !== classId))
      buildTeacherClassMap(allClassData.filter(c => c.id !== classId))
      if (filterClass === classId) setFilterClass('all')
      showFeedback(`'${className}' 반이 삭제되었습니다.`, 'success')
    } catch (err: any) {
      showFeedback(`삭제 실패: ${err.message}`, 'error')
    }
  }

  // ── 권한 변경 ──
  const handleRoleChange = async (userId: string, newRole: string) => {
    setLoadingId(userId)
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
    if (error) {
      showFeedback(`권한 변경 실패: ${error.message}`, 'error')
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
      showFeedback('권한이 변경되었습니다.', 'success')
    }
    setLoadingId(null)
  }

  // ── 학생 소속반 변경 ──
  const handleStudentClassChange = async (userId: string, classId: string | null) => {
    setLoadingId(userId)
    const { error } = await supabase.from('users').update({ class_id: classId }).eq('id', userId)
    if (error) {
      showFeedback(`반 배정 실패: ${error.message}`, 'error')
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, class_id: classId } : u))
      showFeedback('소속반이 변경되었습니다.', 'success')
    }
    setLoadingId(null)
  }

  // ── 교사 반 배정 모달 열기 ──
  const openTeacherClassModal = (teacher: User) => {
    const pending: Record<string, 'professor' | 'instructor' | 'none'> = {}
    allClassData.forEach(c => {
      if (c.professor_id === teacher.id)       pending[c.id] = 'professor'
      else if (c.instructor_id === teacher.id) pending[c.id] = 'instructor'
      else                                     pending[c.id] = 'none'
    })
    setClassModalTeacher(teacher)
    setClassModalPending(pending)
    setClassModalOpen(true)
  }

  // ── 교사 반 배정 저장 ──
  const handleSaveTeacherAssignments = async () => {
    if (!classModalTeacher) return
    setClassModalSaving(true)
    try {
      for (const c of allClassData) {
        const newRole = classModalPending[c.id] ?? 'none'
        const wasProf = c.professor_id  === classModalTeacher.id
        const wasInst = c.instructor_id === classModalTeacher.id
        const oldRole = wasProf ? 'professor' : wasInst ? 'instructor' : 'none'
        if (newRole === oldRole) continue
        const updates: Partial<{ professor_id: string | null; instructor_id: string | null }> = {}
        if (newRole === 'professor') {
          updates.professor_id = classModalTeacher.id
          if (wasInst) updates.instructor_id = null
        } else if (newRole === 'instructor') {
          updates.instructor_id = classModalTeacher.id
          if (wasProf) updates.professor_id = null
        } else {
          if (wasProf) updates.professor_id  = null
          if (wasInst) updates.instructor_id = null
        }
        const { error } = await supabase.from('classes').update(updates).eq('id', c.id)
        if (error) throw error
      }
      await fetchClasses()
      setClassModalOpen(false)
      showFeedback(`${classModalTeacher.name} 선생님 반 배정이 저장되었습니다.`, 'success')
    } catch (err: any) {
      showFeedback(`저장 실패: ${err.message}`, 'error')
    } finally {
      setClassModalSaving(false)
    }
  }

  // ── 단원 삭제 ──
  const handleDelete = async (userId: string, name: string) => {
    if (!window.confirm(`정말 ${name} 단원을 명부에서 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`)) return
    setLoadingId(userId)
    try {
      const res  = await fetch(`/api/users?id=${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      setUsers(users.filter(u => u.id !== userId))
      showFeedback(`${name} 단원이 삭제되었습니다.`, 'success')
    } catch (err: any) {
      showFeedback(`단원 삭제 실패: ${err.message}`, 'error')
    } finally {
      setLoadingId(null)
    }
  }

  // ── 단원 수동 추가 ──
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = {
        ...newMember,
        cohort:     newMember.cohort     ? Number(newMember.cohort) : null,
        instrument: newMember.instrument || null,
      }
      const res  = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '유저 생성 실패')
      setUsers([data.user, ...users])
      showFeedback('새 단원이 추가되었습니다.', 'success')
      setIsModalOpen(false)
      setNewMember({ email: '', password: '', name: '', role: 'student', cohort: '4', instrument: '' })
    } catch (err: any) {
      showFeedback(`단원 추가 실패: ${err.message}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── 비밀번호 초기화 ──
  const handleResetPassword = async (userId: string) => {
    const pw = window.prompt('새로운 임시 비밀번호를 입력하세요 (최소 6자리):', 'sangsang1234!')
    if (!pw || pw.trim() === '') return
    if (pw.length < 6) return alert('비밀번호는 최소 6자리 이상이어야 합니다.')
    try {
      const res  = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: userId, password: pw }) })
      const data = await res.json()
      if (res.ok) alert('비밀번호가 초기화되었습니다.')
      else        alert(`초기화 실패: ${data.error || '알 수 없는 에러'}`)
    } catch (err: any) {
      alert(`초기화 중 오류 발생: ${err.message}`)
    }
  }

  // ── CSV 다운로드 ──
  const handleExportCSV = () => {
    try {
      const headers = ['이름', '이메일', '권한', '기수', '악기', '소속반', '가입일']
      const rows = filteredUsers.map(u => {
        const className = u.class_id
          ? allClassData.find(c => c.id === u.class_id)?.name || u.class_id
          : '-'
        return [u.name, u.email, roleLabels[u.role] || u.role, u.cohort ? `${u.cohort}기` : '-', u.instrument || '-', className || '-', new Date(u.created_at).toLocaleDateString('ko-KR')]
      })
      const csv  = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.setAttribute('download', `단원명부_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
      showFeedback('CSV 다운로드가 시작되었습니다.', 'success')
    } catch {
      showFeedback('CSV 다운로드 중 오류가 발생했습니다.', 'error')
    }
  }

  // ── 샘플 CSV 다운로드 ──
  const downloadSampleCSV = () => {
    const sample = [
      '이름,이메일,비밀번호,역할,기수,악기',
      '홍길동,hong@sangsang.local,sangsang1234!,학생,4,바이올린',
      '김철수,kim@sangsang.local,sangsang1234!,학생,4,첼로',
      '이선생,lee@sangsang.local,sangsang1234!,선생님,,',
    ].join('\n')
    const blob = new Blob(['﻿' + sample], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.setAttribute('download', '단원명부_샘플.csv')
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
  }

  // ── CSV 파일 선택 ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      setCsvRows(rows)
      setImportStatus('preview')
      setImportProgress(0)
      setImportResults([])
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  // ── CSV 일괄 가져오기 실행 ──
  const handleImport = async () => {
    const validRows = csvRows.filter(r => r.errors.length === 0)
    if (validRows.length === 0) return
    setImportStatus('importing')
    setImportProgress(0)
    const results: ImportResult[] = []

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        const res  = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email:      row.email,
            password:   row.password,
            name:       row.name,
            role:       row.role,
            cohort:     row.cohort ? Number(row.cohort) : null,
            instrument: row.instrument || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '오류')
        results.push({ rowNum: row.rowNum, name: row.name, email: row.email, status: 'success' })
        setUsers(prev => [data.user, ...prev])
      } catch (err: any) {
        results.push({ rowNum: row.rowNum, name: row.name, email: row.email, status: 'error', message: err.message })
      }
      setImportProgress(i + 1)
      setImportResults([...results])
    }

    setImportStatus('done')
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin': return styles.adminBadge; case 'director': return styles.directorBadge
      case 'teacher': return styles.teacherBadge; default: return styles.studentBadge
    }
  }

  // ── 소속반 셀 ──
  const renderClassCell = (u: User) => {
    if (u.role === 'student') {
      return (
        <select value={u.class_id || ''} onChange={e => handleStudentClassChange(u.id, e.target.value || null)}
          className={styles.classSelect} disabled={loadingId === u.id}>
          <option value="">미배정</option>
          {allClassData.filter(c => c.name).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )
    }
    if (u.role === 'teacher') {
      const assignments = teacherClassMap[u.id] || []
      return (
        <div className={styles.classCell}>
          {assignments.length === 0
            ? <span className={styles.unassignedText}>미배정</span>
            : assignments.map(tc => (
                <span key={tc.classId} className={tc.role === 'professor' ? styles.classBadgeProf : styles.classBadgeInst}>
                  {tc.className} {tc.role === 'professor' ? '(교수)' : '(강사)'}
                </span>
              ))
          }
          <button className={styles.classAssignBtn} onClick={() => openTeacherClassModal(u)}>반 배정</button>
        </div>
      )
    }
    return <span style={{ color: '#a0aec0', fontSize: 13 }}>—</span>
  }

  const validCsvCount = csvRows.filter(r => r.errors.length === 0).length

  return (
    <>
      {/* ── 액션 바 ── */}
      <div className={styles.actionBar}>
        <div className={styles.actionButtons}>
          <button className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
            <span style={{ fontSize: '16px' }}>+</span> 단원 추가
          </button>
          <button className={styles.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
            📥 CSV 가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button className={styles.secondaryBtn} onClick={() => setClassManageOpen(true)}>
            🏫 클래스 관리
          </button>
          <button className={styles.secondaryBtn} onClick={handleExportCSV}>
            ⬇️ 명부 다운로드 (CSV)
          </button>
        </div>
      </div>

      {/* ── 검색 / 필터 바 ── */}
      <div className={styles.filterBar}>
        <input type="text" placeholder="이름 또는 이메일 검색..." className={styles.searchInput}
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <select className={styles.filterSelect} value={filterRole}       onChange={e => setFilterRole(e.target.value)}>
          <option value="all">모든 권한</option><option value="student">학생만</option>
          <option value="teacher">선생님만</option><option value="director">디렉터만</option>
          <option value="admin">관리자만</option>
        </select>
        <select className={styles.filterSelect} value={filterCohort}     onChange={e => setFilterCohort(e.target.value)}>
          <option value="all">모든 기수</option><option value="1">1기</option><option value="2">2기</option>
          <option value="3">3기</option><option value="4">4기</option><option value="none">기수 없음</option>
        </select>
        <select className={styles.filterSelect} value={filterInstrument} onChange={e => setFilterInstrument(e.target.value)}>
          <option value="all">모든 악기</option><option value="바이올린">바이올린</option>
          <option value="비올라">비올라</option><option value="첼로">첼로</option>
          <option value="콘트라베이스">콘트라베이스</option><option value="플루트">플루트</option>
          <option value="클라리넷">클라리넷</option><option value="none">악기 없음</option>
        </select>
        <select className={styles.filterSelect} value={filterClass}      onChange={e => setFilterClass(e.target.value)}>
          <option value="all">전체 반</option>
          {allClassData.filter(c => c.name).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* ── 테이블 ── */}
      <div className={styles.tableContainer} style={{ position: 'relative' }}>
        {feedback && (
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            padding: '12px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
            backgroundColor: feedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: feedback.type === 'success' ? '#047857' : '#b91c1c',
            border: `1px solid ${feedback.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          }}>
            {feedback.message}
          </div>
        )}
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 40, padding: '16px 8px' }}></th>
              <th>이름</th><th>이메일</th><th>권한</th><th>기수</th>
              <th>악기</th><th>소속반 / 담당반</th><th>가입일</th>
              <th style={{ textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <>
              <tr key={u.id} className={expandedRows.has(u.id) ? styles.expandedMainRow : ''}>
                <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                  <button className={styles.expandToggle} onClick={() => toggleExpand(u.id)}
                    title={expandedRows.has(u.id) ? '접기' : '개인정보 펼치기'}>
                    {expandedRows.has(u.id) ? '▼' : '▶'}
                  </button>
                </td>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role.toLowerCase()} onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={loadingId === u.id} className={`${styles.roleSelect} ${getRoleBadgeClass(u.role)}`}>
                    <option value="admin">관리자</option><option value="director">디렉터</option>
                    <option value="teacher">선생님</option><option value="student">학생</option>
                  </select>
                  {loadingId === u.id && <span style={{ marginLeft: 8, fontSize: 12 }}>⏳</span>}
                </td>
                <td>{u.cohort ? `${u.cohort}기` : '-'}</td>
                <td>{u.instrument || '-'}</td>
                <td>{renderClassCell(u)}</td>
                <td>{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className={styles.deleteBtn} style={{ color: '#0ea5e9', marginRight: '4px' }}
                    onClick={() => handleResetPassword(u.id)} disabled={loadingId === u.id}>비번 초기화</button>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)} disabled={loadingId === u.id}>삭제</button>
                </td>
              </tr>

              {/* ── 펼쳐진 개인정보 행 ── */}
              {expandedRows.has(u.id) && (
                <tr key={`${u.id}-private`} className={styles.expandedRow}>
                  <td colSpan={9} className={styles.expandedCell}>
                    {editingPrivate === u.id ? (
                      <div className={styles.privatePanel}>
                        <div className={styles.privatePanelGrid}>
                          <div className={styles.privateField}>
                            <label>보호자</label>
                            <input value={privateDraft.guardian} placeholder="보호자 이름"
                              onChange={e => setPrivateDraft(d => ({ ...d, guardian: e.target.value }))} />
                          </div>
                          <div className={styles.privateField}>
                            <label>연락처</label>
                            <input value={privateDraft.phone} placeholder="010-0000-0000"
                              onChange={e => setPrivateDraft(d => ({ ...d, phone: e.target.value }))} />
                          </div>
                          <div className={`${styles.privateField} ${styles.privateFieldFull}`}>
                            <label>주소</label>
                            <input value={privateDraft.address} placeholder="주소 입력"
                              onChange={e => setPrivateDraft(d => ({ ...d, address: e.target.value }))} />
                          </div>
                          <div className={`${styles.privateField} ${styles.privateFieldFull}`}>
                            <label>비고</label>
                            <textarea value={privateDraft.note} placeholder="장애 등급, 특이사항 등"
                              rows={2}
                              onChange={e => setPrivateDraft(d => ({ ...d, note: e.target.value }))} />
                          </div>
                        </div>
                        <div className={styles.privatePanelActions}>
                          <button className={styles.cmCancelBtn} onClick={() => setEditingPrivate(null)} disabled={privateSaving}>취소</button>
                          <button className={styles.cmSaveBtn} onClick={() => handleSavePrivate(u.id)} disabled={privateSaving}>
                            {privateSaving ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.privatePanel}>
                        <div className={styles.privatePanelGrid}>
                          <div className={styles.privateItem}>
                            <span className={styles.privateLabel}>보호자</span>
                            <span className={styles.privateValue}>{u.guardian || <span className={styles.privateEmpty}>미입력</span>}</span>
                          </div>
                          <div className={styles.privateItem}>
                            <span className={styles.privateLabel}>연락처</span>
                            <span className={styles.privateValue}>{u.phone || <span className={styles.privateEmpty}>미입력</span>}</span>
                          </div>
                          <div className={`${styles.privateItem} ${styles.privateItemFull}`}>
                            <span className={styles.privateLabel}>주소</span>
                            <span className={styles.privateValue}>{u.address || <span className={styles.privateEmpty}>미입력</span>}</span>
                          </div>
                          <div className={`${styles.privateItem} ${styles.privateItemFull}`}>
                            <span className={styles.privateLabel}>비고</span>
                            <span className={styles.privateValue} style={{ whiteSpace: 'pre-wrap' }}>{u.note || <span className={styles.privateEmpty}>미입력</span>}</span>
                          </div>
                        </div>
                        <div className={styles.privatePanelActions}>
                          <button className={styles.cmEditBtn} onClick={() => openPrivateEdit(u)}>수정</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </>
            ))}
            {filteredUsers.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>조건에 맞는 단원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 단원 추가 모달 ── */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>새 단원 추가</h2>
            <form onSubmit={handleCreateUser}>
              <div className={styles.formGroup}><label>이메일</label>
                <input type="email" required placeholder="example@email.com" value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} /></div>
              <div className={styles.formGroup}><label>비밀번호 (초기)</label>
                <input type="password" required minLength={6} placeholder="최소 6자리 이상" value={newMember.password} onChange={e => setNewMember({ ...newMember, password: e.target.value })} /></div>
              <div className={styles.formGroup}><label>이름 (실명)</label>
                <input type="text" required placeholder="홍길동" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} /></div>
              <div className={styles.formGroup}><label>기수</label>
                <select value={newMember.cohort} onChange={e => setNewMember({ ...newMember, cohort: e.target.value })}>
                  <option value="">선택 안 함</option><option value="1">1기</option><option value="2">2기</option>
                  <option value="3">3기</option><option value="4">4기</option></select></div>
              <div className={styles.formGroup}><label>악기 파트</label>
                <select value={newMember.instrument} onChange={e => setNewMember({ ...newMember, instrument: e.target.value })}>
                  <option value="">선택 안 함</option><option value="바이올린">바이올린</option>
                  <option value="비올라">비올라</option><option value="첼로">첼로</option>
                  <option value="콘트라베이스">콘트라베이스</option><option value="플루트">플루트</option>
                  <option value="클라리넷">클라리넷</option></select></div>
              <div className={styles.formGroup}><label>권한</label>
                <select value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value })}>
                  <option value="student">학생 (Student)</option><option value="teacher">선생님 (Teacher)</option>
                  <option value="director">디렉터 (Director)</option><option value="admin">관리자 (Admin)</option></select></div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>취소</button>
                <button type="submit" className={styles.primaryBtn} disabled={isSubmitting} style={{ justifyContent: 'center' }}>
                  {isSubmitting ? '저장 중...' : '저장하기'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 클래스 관리 모달 ── */}
      {classManageOpen && (
        <div className={styles.modalOverlay} onClick={() => setClassManageOpen(false)}>
          <div className={styles.classManageModal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>🏫 클래스 관리</h2>

            {/* 클래스 목록 */}
            <div className={styles.classManageList}>
              <div className={styles.classManageHeader}>
                <span className={styles.cmhName}>반 이름</span>
                <span className={styles.cmhTeacher}>담당 선생님</span>
                <span className={styles.cmhActions}>관리</span>
              </div>

              {allClassData.length === 0 ? (
                <div className={styles.classManageEmpty}>아직 생성된 반이 없습니다.</div>
              ) : (
                allClassData.map(c => (
                  <div key={c.id} className={styles.classManageRow}>
                    {editingId === c.id ? (
                      <>
                        <input
                          className={styles.classEditInput}
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateClassName(c.id); if (e.key === 'Escape') setEditingId(null) }}
                          autoFocus
                        />
                        <div className={styles.cmRowActions}>
                          <button className={styles.cmSaveBtn} onClick={() => handleUpdateClassName(c.id)} disabled={editSaving || !editingName.trim()}>
                            {editSaving ? '…' : '저장'}
                          </button>
                          <button className={styles.cmCancelBtn} onClick={() => setEditingId(null)} disabled={editSaving}>취소</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={styles.cmRowName}>{c.name || '(이름 없음)'}</span>
                        <span className={styles.cmRowTeacher}>{getTeacherName(c.teacher_id)}</span>
                        <div className={styles.cmRowActions}>
                          <button className={styles.cmEditBtn} onClick={() => { setEditingId(c.id); setEditingName(c.name || '') }}>수정</button>
                          <button className={styles.cmDeleteBtn} onClick={() => handleDeleteClass(c.id, c.name || '반')}>삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 새 반 추가 폼 */}
            <div className={styles.classCreateSection}>
              <div className={styles.classCreateTitle}>+ 새 반 추가</div>
              <form onSubmit={handleCreateClass} className={styles.classCreateForm}>
                <input
                  type="text" required placeholder="반 이름 입력 (예: 바이올린 A반)"
                  value={createName} onChange={e => setCreateName(e.target.value)}
                  className={styles.classCreateInput}
                />
                <select required value={createTeacherId} onChange={e => setCreateTeacherId(e.target.value)}
                  className={styles.classCreateSelect}>
                  <option value="">담당 선생님 선택</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button type="submit" className={styles.classCreateBtn}
                  disabled={createSaving || !createName.trim() || !createTeacherId}>
                  {createSaving ? '생성 중...' : '생성'}
                </button>
              </form>
              {teachers.length === 0 && (
                <p className={styles.classCreateWarn}>선생님 계정을 먼저 추가해 주세요.</p>
              )}
            </div>

            <div className={styles.modalActions} style={{ marginTop: 0 }}>
              <button className={styles.primaryBtn} onClick={() => setClassManageOpen(false)} style={{ justifyContent: 'center' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 교사 반 배정 모달 ── */}
      {classModalOpen && classModalTeacher && (
        <div className={styles.modalOverlay} onClick={() => setClassModalOpen(false)}>
          <div className={styles.classModal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>👩‍🏫 {classModalTeacher.name} 선생님 반 배정</h2>
            <p className={styles.classModalSubtitle}>각 반에서의 역할을 선택하세요.</p>
            {allClassData.length === 0 ? (
              <div style={{ color: '#a0aec0', textAlign: 'center', padding: '20px 0' }}>
                등록된 반이 없습니다. 클래스 관리에서 반을 생성해 주세요.
              </div>
            ) : (
              <div className={styles.classModalList}>
                <div className={styles.classModalHeader}><span>반 이름</span><span>역할</span></div>
                {allClassData.map(c => (
                  <div key={c.id} className={styles.classModalRow}>
                    <span className={styles.classModalName}>{c.name}</span>
                    <select value={classModalPending[c.id] ?? 'none'}
                      onChange={e => setClassModalPending(prev => ({ ...prev, [c.id]: e.target.value as 'professor' | 'instructor' | 'none' }))}
                      className={styles.classModalSelect}>
                      <option value="none">미배정</option>
                      <option value="professor">담당교수 (주강사)</option>
                      <option value="instructor">보조강사</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setClassModalOpen(false)} disabled={classModalSaving}>취소</button>
              <button type="button" className={styles.primaryBtn} onClick={handleSaveTeacherAssignments} disabled={classModalSaving} style={{ justifyContent: 'center' }}>
                {classModalSaving ? '저장 중...' : '저장하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV 가져오기 모달 ── */}
      {importStatus !== 'idle' && (
        <div className={styles.modalOverlay} onClick={() => importStatus !== 'importing' && setImportStatus('idle')}>
          <div className={styles.importModal} onClick={e => e.stopPropagation()}>

            {/* 미리보기 */}
            {importStatus === 'preview' && (
              <>
                <h2 className={styles.modalTitle}>📥 CSV 일괄 가져오기</h2>
                <div className={styles.importSummary}>
                  <span>총 <b>{csvRows.length}</b>명</span>
                  <span className={styles.importSummaryOk}>유효 <b>{validCsvCount}</b>명</span>
                  {csvRows.some(r => r.errors.length > 0) && (
                    <span className={styles.importSummaryErr}>오류 <b>{csvRows.filter(r => r.errors.length > 0).length}</b>명 (건너뜀)</span>
                  )}
                </div>
                <div className={styles.importTableWrap}>
                  <table className={styles.importTable}>
                    <thead>
                      <tr>
                        <th>행</th><th>이름</th><th>이메일</th><th>역할</th><th>기수</th><th>악기</th><th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map(row => (
                        <tr key={row.rowNum} className={row.errors.length > 0 ? styles.importRowError : ''}>
                          <td style={{ color: '#a0aec0', fontSize: 12 }}>{row.rowNum}</td>
                          <td>{row.name || <span style={{ color: '#a0aec0' }}>-</span>}</td>
                          <td style={{ fontSize: 12 }}>{row.email || <span style={{ color: '#a0aec0' }}>-</span>}</td>
                          <td>{roleLabels[row.role] || row.role}</td>
                          <td>{row.cohort ? `${row.cohort}기` : '-'}</td>
                          <td>{row.instrument || '-'}</td>
                          <td>
                            {row.errors.length > 0
                              ? <span className={styles.importErrBadge}>{row.errors.join(', ')}</span>
                              : <span className={styles.importOkBadge}>정상</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.importHelp}>
                  열 이름: <code>이름, 이메일, 비밀번호, 역할, 기수, 악기</code> &nbsp;·&nbsp;
                  <button className={styles.importHelpBtn} onClick={downloadSampleCSV}>샘플 CSV 다운로드</button>
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.secondaryBtn} onClick={() => setImportStatus('idle')}>취소</button>
                  <button className={styles.primaryBtn} disabled={validCsvCount === 0} onClick={handleImport} style={{ justifyContent: 'center' }}>
                    {validCsvCount}명 가져오기 시작
                  </button>
                </div>
              </>
            )}

            {/* 진행 중 */}
            {importStatus === 'importing' && (
              <>
                <h2 className={styles.modalTitle}>단원 추가 중...</h2>
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${(importProgress / validCsvCount) * 100}%` }} />
                  </div>
                  <div className={styles.progressText}>{importProgress} / {validCsvCount} 처리 완료</div>
                </div>
                <div className={styles.importResultList}>
                  {importResults.map(r => (
                    <div key={r.rowNum} className={r.status === 'success' ? styles.importResultOk : styles.importResultFail}>
                      <span>{r.name} <span style={{ fontSize: 12, opacity: 0.7 }}>({r.email})</span></span>
                      <span>{r.status === 'success' ? '✓ 완료' : `✗ ${r.message}`}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 완료 */}
            {importStatus === 'done' && (
              <>
                <h2 className={styles.modalTitle}>가져오기 완료</h2>
                <div className={styles.importSummary}>
                  <span className={styles.importSummaryOk}>
                    ✓ 성공 <b>{importResults.filter(r => r.status === 'success').length}</b>명
                  </span>
                  {importResults.some(r => r.status === 'error') && (
                    <span className={styles.importSummaryErr}>
                      ✗ 실패 <b>{importResults.filter(r => r.status === 'error').length}</b>명
                    </span>
                  )}
                </div>
                {importResults.some(r => r.status === 'error') && (
                  <div className={styles.importResultList}>
                    <div className={styles.importResultListTitle}>실패 목록</div>
                    {importResults.filter(r => r.status === 'error').map(r => (
                      <div key={r.rowNum} className={styles.importResultFail}>
                        <span>{r.name} <span style={{ fontSize: 12 }}>({r.email})</span></span>
                        <span>✗ {r.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.modalActions}>
                  <button className={styles.primaryBtn} onClick={() => setImportStatus('idle')} style={{ justifyContent: 'center' }}>닫기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
