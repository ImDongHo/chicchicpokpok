import { useState } from 'react'

export function StationDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  return (
    <div className="station-description-wrap">
      <p className={`station-description ${expanded ? 'expanded' : ''}`}>
        {text}
      </p>
      {text.length > 140 && (
        <button
          className="description-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '역 소개 접기' : '역 소개 더 보기'}
        </button>
      )}
    </div>
  )
}
