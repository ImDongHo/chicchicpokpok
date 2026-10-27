import { useEffect, useRef, useState } from 'react'
import { stations, lines, stationById, displayLines } from '../data/railway.ts'
import { loadKakaoMaps } from '../kakao.ts'
import type { KakaoMap, KakaoMaps } from '../kakao.ts'
import { Icon } from './Icon.tsx'

interface Props {
  selected: string | null
  visibleIds: Set<string>
  connection: string[] | null
  onSelect: (id: string) => void
}

const key = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim() as string | undefined
const project = (lat: number, lng: number) => [
  (lng - 125.6) * 180,
  (38.4 - lat) * 180,
]
const coastline = [
  [128.3, 38.2],
  [128.6, 38],
  [128.86, 37.77],
  [129.1, 37.4],
  [129.4, 36.9],
  [129.45, 36.2],
  [129.55, 35.7],
  [129.3, 35.4],
  [129.1, 35.1],
  [128.6, 34.8],
  [128.1, 34.7],
  [127.7, 34.6],
  [127.4, 34.7],
  [127, 34.4],
  [126.7, 34.3],
  [126.4, 34.4],
  [126.3, 34.8],
  [126.4, 35.1],
  [126.1, 35.6],
  [126.3, 36.1],
  [126.2, 36.7],
  [126.4, 37],
  [126.7, 37.4],
  [126.5, 37.8],
  [127, 38.1],
  [127.5, 38.3],
]
const landPath =
  coastline
    .map(([lng, lat], i) => `${i ? 'L' : 'M'}${project(lat, lng).join(',')}`)
    .join(' ') + 'Z'
const labelled = new Set([
  '서울',
  '강릉',
  '부산',
  '목포',
  '대전',
  '동대구',
  '광주송정',
  '전주',
  '평창',
  '오송',
])

export function RailMap({ selected, visibleIds, connection, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const sdkRef = useRef<KakaoMaps | null>(null)
  const [mode, setMode] = useState<'loading' | 'live' | 'preview' | 'error'>(
    key ? 'loading' : 'preview',
  )
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (!key || !container.current) return
    let cancelled = false
    const element = container.current
    let resize: ResizeObserver | undefined
    loadKakaoMaps(key)
      .then((sdk) => {
        if (cancelled) return
        sdkRef.current = sdk
        const map = new sdk.Map(element, {
          center: new sdk.LatLng(36.25, 127.8),
          level: 12,
        })
        mapRef.current = map
        resize = new ResizeObserver(() => map.relayout())
        resize.observe(element)
        setMode('live')
      })
      .catch(() => {
        if (!cancelled) setMode('error')
      })
    return () => {
      cancelled = true
      resize?.disconnect()
      mapRef.current = null
      element.replaceChildren()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const sdk = sdkRef.current
    if (mode !== 'live' || !map || !sdk) return
    const layers = lines.map(
      (line) =>
        new sdk.Polyline({
          map,
          path: line.stations.map((id) => {
            const s = stationById.get(id)!
            return new sdk.LatLng(s.lat, s.lng)
          }),
          strokeWeight: 4,
          strokeColor: line.color,
          strokeOpacity: connection ? 0.25 : 0.8,
        }),
    )
    if (connection)
      layers.push(
        new sdk.Polyline({
          map,
          path: connection.map((id) => {
            const s = stationById.get(id)!
            return new sdk.LatLng(s.lat, s.lng)
          }),
          strokeWeight: 6,
          strokeColor: '#176957',
          strokeOpacity: 1,
        }),
      )
    for (const station of stations) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `live-station ${selected === station.id ? 'selected' : ''} ${visibleIds.has(station.id) ? '' : 'dim'}`
      button.textContent = station.name
      button.setAttribute('aria-label', `${station.name}역 선택`)
      button.addEventListener('click', () => onSelect(station.id))
      layers.push(
        new sdk.CustomOverlay({
          map,
          position: new sdk.LatLng(station.lat, station.lng),
          content: button,
          yAnchor: 0.5,
          zIndex: selected === station.id ? 10 : 1,
        }),
      )
    }
    return () => {
      for (const layer of layers) layer.setMap(null)
    }
  }, [mode, selected, visibleIds, connection, onSelect])

  useEffect(() => {
    const map = mapRef.current,
      sdk = sdkRef.current
    if (!map || !sdk || mode !== 'live') return
    if (connection && connection.length > 1) {
      const bounds = new sdk.LatLngBounds()
      for (const id of connection) {
        const s = stationById.get(id)!
        bounds.extend(new sdk.LatLng(s.lat, s.lng))
      }
      map.setBounds(bounds)
    } else if (selected) {
      const s = stationById.get(selected)!
      map.panTo(new sdk.LatLng(s.lat, s.lng))
    }
  }, [selected, connection, mode])

  const changeZoom = (delta: number) => {
    if (mode === 'live' && mapRef.current)
      mapRef.current.setLevel(
        Math.min(14, Math.max(1, mapRef.current.getLevel() - delta)),
      )
    else setZoom((value) => Math.min(2.3, Math.max(0.8, value + delta * 0.2)))
  }
  const resetMap = () => {
    setZoom(1)
    const map = mapRef.current,
      sdk = sdkRef.current
    if (map && sdk) {
      map.panTo(new sdk.LatLng(36.25, 127.8))
      map.setLevel(12)
    }
  }

  return (
    <section className="rail-map" aria-label="기차역과 철도 연결 지도">
      <div
        ref={container}
        className={`kakao-map ${mode === 'live' ? 'is-live' : ''}`}
      />
      {mode !== 'live' && (
        <svg
          className="preview-map"
          viewBox="0 0 760 820"
          aria-label="철도망 연결 미리보기"
        >
          <defs>
            <pattern
              id="grid"
              width="36"
              height="36"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M36 0H0V36"
                fill="none"
                stroke="#d6e2df"
                strokeWidth="0.6"
              />
            </pattern>
            <filter id="land-shadow">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="8"
                floodColor="#b5cbc3"
                floodOpacity=".25"
              />
            </filter>
          </defs>
          <rect width="760" height="820" fill="#eaf1ee" />
          <rect width="760" height="820" fill="url(#grid)" />
          <g
            transform={`translate(${380 * (1 - zoom)} ${410 * (1 - zoom)}) scale(${zoom})`}
          >
            <path
              d={landPath}
              fill="#f7f8f0"
              stroke="#d7e0d2"
              strokeWidth="2"
              filter="url(#land-shadow)"
            />
            <g
              className="land-detail"
              fill="none"
              stroke="#e6eadc"
              strokeWidth="2"
            >
              <path d="M290 130Q470 270 550 380T530 570M230 340Q360 370 560 350M205 470Q380 470 630 490M200 590Q400 530 570 600" />
            </g>
            <g className="region-labels">
              <text x="300" y="107">
                수도권
              </text>
              <text x="490" y="185">
                강원
              </text>
              <text x="270" y="355">
                충청
              </text>
              <text x="540" y="450">
                영남
              </text>
              <text x="185" y="535">
                호남
              </text>
              <text x="80" y="410" className="sea-label">
                서해
              </text>
              <text x="690" y="325" className="sea-label">
                동해
              </text>
            </g>
            {lines.map((line) => (
              <polyline
                key={line.id}
                points={line.stations
                  .map((id) => {
                    const s = stationById.get(id)!
                    return project(s.lat, s.lng).join(',')
                  })
                  .join(' ')}
                fill="none"
                stroke={line.color}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={connection ? 0.2 : 0.8}
              />
            ))}
            {connection && (
              <polyline
                points={connection
                  .map((id) => {
                    const s = stationById.get(id)!
                    return project(s.lat, s.lng).join(',')
                  })
                  .join(' ')}
                fill="none"
                stroke="#176957"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {stations.map((station) => {
              const [x, y] = project(station.lat, station.lng)
              const active = station.id === selected
              const label = labelled.has(station.name) || active
              return (
                <g
                  key={station.id}
                  transform={`translate(${x} ${y})`}
                  className={`map-station ${active ? 'selected' : ''} ${visibleIds.has(station.id) ? '' : 'dim'}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${station.name}역 선택`}
                  aria-pressed={active}
                  onClick={() => onSelect(station.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(station.id)
                    }
                  }}
                >
                  <title>
                    {station.name}역 · {station.area}
                  </title>
                  <circle r="16" fill="transparent" />
                  {active && <circle r="16" fill="#176957" opacity=".14" />}
                  <circle
                    r={active ? 7 : 4.5}
                    fill={active ? '#176957' : '#fff'}
                    stroke="#267a65"
                    strokeWidth="2.2"
                  />
                  {label && (
                    <text
                      x={station.name === '오송' ? -12 : 12}
                      y={station.name === '오송' ? -12 : 5}
                      textAnchor={station.name === '오송' ? 'end' : 'start'}
                    >
                      {station.name}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      )}
      <div className="map-heading">
        <span className="map-tag">
          <span className="status-dot" />
          {mode === 'live'
            ? 'Kakao 지도'
            : mode === 'loading'
              ? '지도 불러오는 중'
              : '철도망 미리보기'}
        </span>
        <span className="map-count">
          {stations.length}개 역 · {displayLines.length}개 방면
        </span>
      </div>
      <div className="map-controls">
        <button aria-label="지도 확대" onClick={() => changeZoom(1)}>
          <Icon name="plus" />
        </button>
        <button aria-label="지도 축소" onClick={() => changeZoom(-1)}>
          <Icon name="minus" />
        </button>
        <button aria-label="지도 전체 보기" onClick={resetMap}>
          <Icon name="focus" />
        </button>
      </div>
      <div className="map-legend">
        {displayLines.map((line) => (
          <span key={line.id}>
            <i style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
      {mode !== 'live' && (
        <p className="map-caption">
          {mode === 'error'
            ? '실제 지도를 불러오지 못해 미리보기로 표시합니다.'
            : '연결 관계를 단순화한 미리보기 지도'}
        </p>
      )}
    </section>
  )
}
