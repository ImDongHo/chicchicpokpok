import type { CSSProperties } from 'react'

export type IconName =
  | 'train'
  | 'search'
  | 'pin'
  | 'arrow'
  | 'chevron'
  | 'close'
  | 'swap'
  | 'star'
  | 'map'
  | 'plus'
  | 'minus'
  | 'focus'
  | 'route'
  | 'info'
const paths: Record<IconName, string> = {
  train:
    'M7 18h10a2 2 0 0 0 2-2V6a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v10a2 2 0 0 0 2 2Zm-2-8h14M12 3v7M8 14h.01M16 14h.01M8 18l-3 3m11-3 3 3M8 21h8',
  search: 'm20 20-5-5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M18 6 6 18',
  swap: 'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  focus:
    'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  route:
    'M6 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 7v5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9',
  info: 'M12 17v-5m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
}

export function Icon({
  name,
  size = 20,
  className = '',
  style,
}: {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  )
}
