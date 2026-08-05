// 출결 통계 공용 헬퍼

// 지각 3회 = 결석 1회 환산
export const LATE_TO_ABSENT_RATIO = 3

export interface AttendanceCounts {
  present: number
  late: number
  absent: number
  /** 출석 대체 승인(인정)된 결석. absent/present/late 어디에도 포함하지 않는다. */
  excused?: number
}

export interface AttendanceStats extends Required<AttendanceCounts> {
  /** 지각 누적으로 환산된 결석 횟수 (지각 3회당 1회) */
  convertedAbsent: number
  /** 기록된 결석 + 지각 환산 결석 (인정 결석은 이미 제외됨) */
  effectiveAbsent: number
  /** (전체 - 환산 결석) / 전체, % — 인정 결석은 모수에서도 빠진다 */
  rate: number
}

// 지각 3회 = 결석 1회로 환산해 출석률을 계산한다.
// 출석 대체가 승인된 결석(excused)은 호출부에서 absent 대신 excused 로 집계해서 넘긴다.
export function computeAttendanceStats({ present, late, absent, excused = 0 }: AttendanceCounts): AttendanceStats {
  const total = present + late + absent
  const convertedAbsent = Math.floor(late / LATE_TO_ABSENT_RATIO)
  const effectiveAbsent = absent + convertedAbsent
  const rate = total > 0 ? Math.round(((total - effectiveAbsent) / total) * 100) : 0
  return { present, late, absent, excused, convertedAbsent, effectiveAbsent, rate }
}

/** 학생별 승인된 출석 대체를 조회하기 위한 복합키 */
export const excusedKey = (studentId: string, scheduleId: string) => `${studentId}:${scheduleId}`

// ── 집계 구간: 진행 중인 기수 ──
// 출결 수치는 "최근 N일" 같은 이동 창이 아니라 항상 기수 단위로 센다.

/** 진행 중인 기수의 집계 구간. started_at/closed_at 이 null 이면 그쪽 경계는 열려 있다. */
export type TermWindow = { term: number; started_at: string | null; closed_at: string | null } | null

/** 진행 중인(마감되지 않은) 기수를 찾는다. 없으면 null → 전 기간 집계. */
export async function fetchCurrentTerm(supabase: { from: (t: string) => any }): Promise<TermWindow> {
  const { data } = await supabase.from('attendance_terms')
    .select('term, started_at, closed_at').order('term', { ascending: false })
  return (data || []).find((t: any) => t.closed_at === null) ?? null
}

// 출결 조회를 기수 구간으로 제한한다. 기수 미설정(null)이면 전 기간.
// attendances.date 는 date 라 날짜만 비교하지만, evaluations.created_at 같은 timestamptz 는
// 시각까지 비교해야 한다 — 날짜로 자르면 마감 당일 오후 기록이 통째로 빠진다.
export function scopeToTerm<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
  query: T, w: TermWindow, column = 'date', kind: 'date' | 'timestamp' = 'date',
): T {
  if (!w) return query
  const bound = (v: string) => (kind === 'date' ? v.split('T')[0] : v)
  let q = query
  if (w.started_at) q = q.gte(column, bound(w.started_at))
  if (w.closed_at)  q = q.lte(column, bound(w.closed_at))
  return q
}

// PostgREST 는 한 응답의 행 수에 상한이 있어(기본 1000) 긴 구간의 집계는 끊겨 들어올 수 있다.
// 수치가 조용히 어긋나지 않도록 마지막 페이지까지 이어 받는다. 커서는 고유한 id 로 고정할 것.
export const PAGE_SIZE = 1000
export async function fetchAllPages(
  page: (from: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const rows: any[] = []
  // 서버 상한이 PAGE_SIZE 보다 작을 수도 있으므로, 요청한 크기가 아니라 실제로 받은 만큼 커서를 민다.
  for (let from = 0; ; ) {
    const { data, error } = await page(from)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length === 0) return rows
    from += batch.length
  }
}

// 출석률 % 자체가 아니라 (환산된) 결석 횟수로 신호등 색을 매긴다.
// 0회 = 정상, 1~2회 = 주의, 3회 이상 = 경고.
export function rateColorByAbsence(effectiveAbsent: number): string {
  if (effectiveAbsent <= 0) return '#16a34a'
  if (effectiveAbsent <= 2) return '#d97706'
  return '#dc2626'
}

/** 결석 수치의 계산 근거 문구 (툴팁용). 인정·환산이 모두 없으면 null. */
export function absenceBreakdown(
  a: { absent: number; excused: number; convertedAbsent: number; effectiveAbsent: number },
): string | null {
  if (a.excused === 0 && a.convertedAbsent === 0) return null
  const parts = [`기록 결석 ${a.absent + a.excused}회`]
  if (a.excused > 0) parts.push(`인정(출석 대체 승인) ${a.excused}회 차감`)
  if (a.convertedAbsent > 0) parts.push(`지각 ${LATE_TO_ABSENT_RATIO}회당 1회 환산 ${a.convertedAbsent}회 가산`)
  return `${parts.join(' · ')} = ${a.effectiveAbsent}회`
}
