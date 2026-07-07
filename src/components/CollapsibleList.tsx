'use client'

import { useState } from 'react'

export function CollapsibleList({
  items,
  visibleCount = 5,
  listClassName,
  toggleClassName,
  as: Tag = 'ul',
}: {
  items: React.ReactNode[]
  visibleCount?: number
  listClassName?: string
  toggleClassName?: string
  as?: 'ul' | 'div'
}) {
  const [expanded, setExpanded] = useState(false)
  const hiddenCount = items.length - visibleCount
  const shown = expanded ? items : items.slice(0, visibleCount)

  return (
    <>
      <Tag className={listClassName}>{shown}</Tag>
      {hiddenCount > 0 && (
        <button
          type="button"
          className={toggleClassName}
          onClick={() => setExpanded(v => !v)}
          style={{ width: '100%', border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
        >
          {expanded ? '접기 ▲' : `${hiddenCount}건 더보기 ▼`}
        </button>
      )}
    </>
  )
}
