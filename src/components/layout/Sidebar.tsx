'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Sidebar.module.css'

type Role = 'admin' | 'director' | 'teacher' | 'student'

interface SidebarProps {
  role: Role
}

const MENUS = {
  student: [
    { label: '수업일정', path: '/dashboard/student/schedules', icon: '📅' },
    { label: '공지사항', path: '/dashboard/notices', icon: '📢' },
    { label: '나의 과제', path: '/dashboard/student/assignments', icon: '📝' },
    { label: '출석 대체 신청', path: '/dashboard/student/substitutions', icon: '🙋' },
    { label: '문의게시판', path: '/dashboard/inquiries', icon: '💬' },
  ],
  teacher: [
    { label: '수업 관리', path: '/dashboard/teacher/management', icon: '📚' },
    { label: '출결/평가 관리', path: '/dashboard/evaluations', icon: '✔️' },
    { label: '과제/공지 관리', path: '/dashboard/notices', icon: '📋' },
  ],
  director: [
    { label: '단원 명부', path: '/dashboard/members', icon: '🧑‍🤝‍🧑' },
    { label: '전체 모니터링', path: '/dashboard/director/monitoring', icon: '📊' },
    { label: '출결/평가 현황', path: '/dashboard/evaluations', icon: '📈' },
    { label: '출석 대체 현황', path: '/dashboard/substitutions', icon: '🙋' },
    { label: '공지사항', path: '/dashboard/notices', icon: '📢' },
    { label: '악보', path: '/dashboard/scores', icon: '🎵' },
    { label: '통합 일정', path: '/dashboard/schedules', icon: '📅' },
    { label: '문의게시판', path: '/dashboard/inquiries', icon: '💬' },
  ],
  admin: [
    { label: '단원 명부', path: '/dashboard/members', icon: '🧑‍🤝‍🧑' },
    { label: '전체 통계', path: '/dashboard/admin/stats', icon: '📊' },
    { label: '출결/평가 관리', path: '/dashboard/evaluations', icon: '📝' },
    { label: '출석 대체 관리', path: '/dashboard/substitutions', icon: '🙋' },
    { label: '과제/공지 관리', path: '/dashboard/notices', icon: '📢' },
    { label: '악보 관리', path: '/dashboard/scores', icon: '🎵' },
    { label: '통합 일정 관리', path: '/dashboard/schedules', icon: '📅' },
    { label: '문의게시판', path: '/dashboard/inquiries', icon: '💬' },
  ]
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const currentMenus = MENUS[role] || MENUS['student']

  return (
    <aside className={styles.sidebar}>
      <Link href={`/dashboard/${role}`} className={styles.logoContainer}>
        <div className={styles.logoCircle}>♪</div>
        <div className={styles.logoText}>
          상상휠하모니
          <span>오케스트라</span>
        </div>
      </Link>

      <ul className={styles.menuList}>
        {currentMenus.map((menu) => {
          // Check if current path matches the menu path
          // For active state, we can check if pathname starts with menu.path
          const isActive = pathname.startsWith(menu.path)
          
          return (
            <li key={menu.path}>
              <Link
                href={menu.path}
                className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
              >
                <span style={{ marginRight: '12px' }}>{menu.icon}</span>
                {menu.label}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className={styles.footer}>
        © Music for One
      </div>
    </aside>
  )
}