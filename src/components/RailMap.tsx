import { useEffect, useMemo, useRef, useState } from 'react'
import { stationById } from '../data/railway.ts'
import type { ConnectionSegment, Station } from '../types.ts'
import { getMapStations } from '../lib/map-visibility.ts'
import type { MapViewport } from '../lib/map-visibility.ts'
import { buildSegmentedMapPaths } from '../lib/route-segments.ts'
import { loadKakaoMaps } from '../kakao.ts'
import type { KakaoMap, KakaoMaps, MapLayer } from '../kakao.ts'
import { Icon } from './Icon.tsx'

interface Props {
  selected: string | null
  scopeStations: Station[]
  overview: boolean
  connection: string[] | null
  segments: ConnectionSegment[]
  endpoints: { departure: string; arrival: string } | null
  onSelect: (id: string) => void
}

const key = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim() as string | undefined
const knownStationIds = new Set(stationById.keys())
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

const previewBounds: MapViewport = {
  south: 33.7,
  north: 38.5,
  west: 125.4,
  east: 130.8,
  lat: 36.25,
  lng: 127.8,
  level: 12,
}

function fitMap(
  map: KakaoMap,
  sdk: KakaoMaps,
  targets: Station[],
  overview: boolean,
) {
  if (overview) {
    map.setLevel(12)
    map.panTo(new sdk.LatLng(36.25, 127.8))
  } else if (targets.length === 1) {
    map.setLevel(6)
    map.panTo(new sdk.LatLng(targets[0].lat, targets[0].lng))
  } else if (targets.length) {
    const bounds = new sdk.LatLngBounds()
    for (const station of targets)
      bounds.extend(new sdk.LatLng(station.lat, station.lng))
    map.setBounds(bounds)
  }
}

export function RailMap({
  selected,
  scopeStations,
  overview,
  connection,
  segments,
  endpoints,
  onSelect,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const sdkRef = useRef<KakaoMaps | null>(null)
  const selectRef = useRef(onSelect)
  const overlays = useRef(
    new Map<string, { layer: MapLayer; button: HTMLButtonElement }>(),
  )
  const [mode, setMode] = useState<'loading' | 'live' | 'preview' | 'error'>(
    key ? 'loading' : 'preview',
  )
  const [viewport, setViewport] = useState<MapViewport | null>(null)
  const [zoom, setZoom] = useState(1)
  const geometry = useMemo(
    () =>
      buildSegmentedMapPaths(segments, knownStationIds).map((path, index) => {
        const segment =
          path.segmentIndex === null ? null : segments[path.segmentIndex]
        return {
          key: String(index),
          ids: path.stationIds,
          approximate: path.missingStationIds.length > 0,
          transferGap: segment === null,
          color: segment?.color ?? '#64748b',
          label:
            (segment?.label ?? '환승역 위치 미확인 구간') +
            (path.missingStationIds.length
              ? ` · 위치 미확인 중간역 ${path.missingStationIds.length}개를 포함한 참고 연결`
              : ''),
        }
      }),
    [segments],
  )
  const unknownLocations =
    connection?.filter((id) => !knownStationIds.has(id)).length ?? 0
  const routeColors = useMemo(() => {
    const colors = new Map<string, string>()
    for (const segment of segments)
      for (const id of segment.stationIds) colors.set(id, segment.color)
    return colors
  }, [segments])
  const changeStations = useMemo(
    () => new Set(segments.slice(1).map((segment) => segment.stationIds[0])),
    [segments],
  )

  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!key || !container.current) return
    let cancelled = false
    const element = container.current
    let resize: ResizeObserver | undefined
    let disposeListener: (() => void) | undefined
    let viewFrame = 0,
      resizeFrame = 0
    loadKakaoMaps(key)
      .then((sdk) => {
        if (cancelled) return
        sdkRef.current = sdk
        const map = new sdk.Map(element, {
          center: new sdk.LatLng(37.56, 126.98),
          level: 7,
        })
        mapRef.current = map
        const updateViewport = () => {
          cancelAnimationFrame(viewFrame)
          viewFrame = requestAnimationFrame(() => {
            if (cancelled) return
            const bounds = map.getBounds(),
              center = map.getCenter()
            const southWest = bounds.getSouthWest(),
              northEast = bounds.getNorthEast()
            const next = {
              south: southWest.getLat(),
              north: northEast.getLat(),
              west: southWest.getLng(),
              east: northEast.getLng(),
              lat: center.getLat(),
              lng: center.getLng(),
              level: map.getLevel(),
            }
            setViewport((previous) =>
              previous &&
              Object.keys(next).every(
                (key) =>
                  previous[key as keyof MapViewport] ===
                  next[key as keyof MapViewport],
              )
                ? previous
                : next,
            )
          })
        }
        sdk.event.addListener(map, 'idle', updateViewport)
        disposeListener = () =>
          sdk.event.removeListener(map, 'idle', updateViewport)
        resize = new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame)
          resizeFrame = requestAnimationFrame(() => {
            if (!cancelled) {
              map.relayout()
              updateViewport()
            }
          })
        })
        resize.observe(element)
        updateViewport()
        setMode('live')
      })
      .catch(() => {
        if (!cancelled) setMode('error')
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(viewFrame)
      cancelAnimationFrame(resizeFrame)
      disposeListener?.()
      resize?.disconnect()
      mapRef.current = null
      element.replaceChildren()
    }
  }, [])

  const mapStations = useMemo(() => {
    const view =
      mode === 'live'
        ? viewport
        : { ...previewBounds, level: zoom < 1.4 ? 12 : 8 }
    if (!view) return []
    const focused = [selected, connection?.[0], connection?.at(-1)].filter(
      (id): id is string => !!id,
    )
    return getMapStations(scopeStations, view, focused, overview)
  }, [mode, viewport, zoom, scopeStations, selected, connection, overview])

  // Reuse visible marker objects. Selection and pagination never rebuild the map.
  useEffect(() => {
    const map = mapRef.current,
      sdk = sdkRef.current
    if (mode !== 'live' || !map || !sdk) return
    const wanted = new Set(mapStations.map((station) => station.id))
    for (const [id, entry] of overlays.current) {
      if (!wanted.has(id)) {
        entry.layer.setMap(null)
        overlays.current.delete(id)
      }
    }
    for (const station of mapStations) {
      if (overlays.current.has(station.id)) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'live-station'
      button.textContent = station.name
      button.setAttribute('aria-label', station.name + '역 선택')
      button.addEventListener('click', () => selectRef.current(station.id))
      const layer = new sdk.CustomOverlay({
        map,
        position: new sdk.LatLng(station.lat, station.lng),
        content: button,
        yAnchor: 0.5,
        zIndex: 1,
      })
      overlays.current.set(station.id, { layer, button })
    }
  }, [mode, mapStations])

  useEffect(() => {
    for (const [id, entry] of overlays.current) {
      const endpoint =
        id === connection?.[0]
          ? '출발'
          : id === connection?.at(-1)
            ? '도착'
            : ''
      const label =
        (endpoint ? endpoint + ' · ' : '') + stationById.get(id)!.name
      if (entry.button.textContent !== label)
        entry.button.replaceChildren(label)
      entry.button.classList.toggle('route-endpoint', !!endpoint)
      entry.button.classList.toggle('selected', id === selected)
      entry.button.setAttribute('aria-pressed', String(id === selected))
      entry.button.classList.toggle('route-change', changeStations.has(id))
      const color = routeColors.get(id)
      if (color) entry.button.style.setProperty('--route-color', color)
      else entry.button.style.removeProperty('--route-color')
      entry.button.setAttribute(
        'title',
        changeStations.has(id)
          ? '열차 경로 전환 지점 · 실제 환승 가능 여부는 시간표 확인'
          : '',
      )
      entry.layer.setZIndex?.(id === selected ? 10 : 1)
    }
  }, [mode, selected, mapStations, routeColors, changeStations, connection])

  useEffect(() => {
    const cache = overlays.current
    return () => {
      for (const entry of cache.values()) entry.layer.setMap(null)
      cache.clear()
    }
  }, [mode])

  // Only requested train-path segments create polylines, independently of markers.
  useEffect(() => {
    const map = mapRef.current,
      sdk = sdkRef.current
    if (mode !== 'live' || !map || !sdk || !geometry.length) return
    const layers = geometry.map(
      (segment) =>
        new sdk.Polyline({
          map,
          path: segment.ids.map((id) => {
            const s = stationById.get(id)!
            return new sdk.LatLng(s.lat, s.lng)
          }),
          strokeWeight: segment.approximate ? 4 : 5,
          strokeColor: segment.color,
          strokeOpacity: segment.approximate ? 0.65 : 0.95,
          strokeStyle: segment.approximate ? 'shortdot' : 'shortdash',
        }),
    )
    return () => {
      for (const layer of layers) layer.setMap(null)
    }
  }, [mode, geometry])

  useEffect(() => {
    const map = mapRef.current,
      sdk = sdkRef.current
    if (mode !== 'live' || !map || !sdk) return
    const targets = scopeStations
    fitMap(map, sdk, targets, overview && !connection)
  }, [mode, scopeStations, connection, overview])

  useEffect(() => {
    const map = mapRef.current,
      sdk = sdkRef.current
    if (mode !== 'live' || !map || !sdk || !selected || connection) return
    const station = stationById.get(selected)!
    map.panTo(new sdk.LatLng(station.lat, station.lng))
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
    if (map && sdk) fitMap(map, sdk, scopeStations, overview && !connection)
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
            {geometry.map((segment) => (
              <polyline
                key={segment.key}
                points={segment.ids
                  .map((id) => {
                    const s = stationById.get(id)!
                    return project(s.lat, s.lng).join(',')
                  })
                  .join(' ')}
                fill="none"
                stroke={segment.color}
                strokeWidth={segment.approximate ? 4 : 6}
                strokeOpacity={segment.approximate ? 0.65 : 1}
                strokeDasharray={segment.approximate ? '2 7' : '8 6'}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{segment.label}</title>
              </polyline>
            ))}
            {mapStations.map((station) => {
              const [x, y] = project(station.lat, station.lng)
              const active = station.id === selected
              const endpoint =
                station.id === connection?.[0]
                  ? '출발'
                  : station.id === connection?.at(-1)
                    ? '도착'
                    : ''
              const routeColor = routeColors.get(station.id) ?? '#267a65'
              const label = labelled.has(station.name) || active || !!endpoint
              return (
                <g
                  key={station.id}
                  transform={`translate(${x} ${y})`}
                  className={`map-station ${active ? 'selected' : ''}`}
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
                    {changeStations.has(station.id)
                      ? ' · 열차 경로 전환 지점'
                      : ''}
                  </title>
                  <circle r="16" fill="transparent" />
                  {changeStations.has(station.id) && (
                    <circle
                      r="10"
                      fill="white"
                      stroke={routeColor}
                      strokeWidth="2"
                    />
                  )}
                  {active && <circle r="16" fill="#176957" opacity=".14" />}
                  <circle
                    r={active ? 7 : 4.5}
                    fill={active ? routeColor : '#fff'}
                    stroke={routeColor}
                    strokeWidth="2.2"
                  />
                  {label && (
                    <text
                      x={station.name === '오송' ? -12 : 12}
                      y={station.name === '오송' ? -12 : 5}
                      textAnchor={station.name === '오송' ? 'end' : 'start'}
                    >
                      {endpoint ? endpoint + ' · ' : ''}
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
        <span className="map-count">현재 {mapStations.length}개 역 표시</span>
        {connection && endpoints && (
          <div
            className="map-endpoint-summary"
            aria-label="지도 출발역과 도착역"
          >
            <span>
              출발 <strong>{endpoints.departure}역</strong>
              {!knownStationIds.has(connection[0]) && (
                <small>지도 위치 미확인</small>
              )}
            </span>
            <Icon name="arrow" size={13} />
            <span>
              도착 <strong>{endpoints.arrival}역</strong>
              {!knownStationIds.has(connection.at(-1)!) && (
                <small>지도 위치 미확인</small>
              )}
            </span>
          </div>
        )}
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
      <div className="map-legend" aria-label="열차 경로 색상 범례">
        {connection ? (
          segments.map((segment) => (
            <span key={`${segment.lineId}:${segment.startIndex}`}>
              <i style={{ background: segment.color }} />
              {segment.label}
            </span>
          ))
        ) : (
          <span>
            {overview
              ? '지도를 확대하거나 지역을 선택해 보세요'
              : '역을 선택한 뒤 연결 경로를 살펴보세요'}
          </span>
        )}
        {geometry.some((path) => path.transferGap) && (
          <span>
            <i style={{ background: '#64748b' }} />
            환승역 위치 미확인 참고 연결
          </span>
        )}
      </div>
      {(connection || mode !== 'live') && (
        <p className="map-caption">
          {connection
            ? `정차역 간 직선 연결 · 실제 선로 아님${unknownLocations ? ` · 옅은 점선: 일부 역 위치 미확인(${unknownLocations}개)` : ''}`
            : mode === 'error'
              ? '실제 지도를 불러오지 못해 미리보기로 표시합니다.'
              : '연결 관계를 단순화한 미리보기 지도'}
        </p>
      )}
    </section>
  )
}
