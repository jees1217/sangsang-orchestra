// 출석 대체 신청 공용 상수/헬퍼

export const SUBSTITUTION_REASONS = {
  medical:     { label: '병가 (수술·입원 등)', icon: '🏥' },
  competition: { label: '콩쿠르',              icon: '🏆' },
} as const

export type SubstitutionReason = keyof typeof SUBSTITUTION_REASONS

export const SUBSTITUTION_STATUS = {
  pending:  { label: '심사 대기', color: '#d97706', bg: '#fef3c7' },
  approved: { label: '승인',      color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: '반려',      color: '#dc2626', bg: '#fee2e2' },
} as const

export type SubstitutionStatus = keyof typeof SUBSTITUTION_STATUS

// 증빙서류 최대 용량 (PDF 원본 대비 상한)
export const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10MB

export const DOC_ACCEPT = 'image/*,application/pdf'

// 기수: 6월~차기 5월. 결석(수업) 날짜 기준으로 소속 기수 키를 만든다. 예) 2026-06-01 → '2026-2027'
export function termKeyForDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
