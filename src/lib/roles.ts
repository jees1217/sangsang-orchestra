/**
 * 수업 담당자(선생님)로 선택할 수 있는 역할 목록.
 *
 * 담당 선생님은 `teacher` 역할만이 아니다 — 관리자(`admin`)나 옵저버(`director`)
 * 계정도 실제로 수업을 맡는 경우가 있어서, 반 담당 선생님 / 일정 담당자 선택
 * 명단에는 세 역할을 모두 내려준다. (계정 권한 등급과 "누가 수업을 담당하는가"는
 * 별개의 문제이므로, 등급을 옮겨도 담당 배정이 사라지지 않게 하려는 목적)
 *
 * 이 목록은 "선택 가능한 후보"에만 쓴다. 선생님 수 집계나 선생님 대상 공지처럼
 * 역할 자체를 세는 곳에는 쓰지 말 것.
 */
export const CLASS_TEACHER_ROLES = ['teacher', 'director', 'admin'] as const

export function isClassTeacherRole(role: string | null | undefined): boolean {
  return !!role && (CLASS_TEACHER_ROLES as readonly string[]).includes(role)
}

/**
 * 단원명부(MemberListClient)의 "담당 반" 칸·"반 배정" 버튼을 노출할 역할.
 *
 * 옵저버(director)는 예전부터 반 담당 선생님 후보에는 들어가 있었지만, 단원명부
 * 자체에서 담당 반 표시·배정 버튼을 받은 적은 없다 — 여기서 director를 포함하면
 * "관리자로 전환된 계정을 후보에 넣어달라"는 요청보다 넓은 UI 변경이 된다.
 * 그래서 이 리스트는 CLASS_TEACHER_ROLES보다 좁게, teacher/admin만 포함한다.
 */
export const MEMBER_LIST_TEACHER_ROLES = ['teacher', 'admin'] as const

export function isMemberListTeacherRole(role: string | null | undefined): boolean {
  return !!role && (MEMBER_LIST_TEACHER_ROLES as readonly string[]).includes(role)
}
