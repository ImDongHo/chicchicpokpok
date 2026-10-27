import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './components/Icon.tsx'
import { RailMap } from './components/RailMap.tsx'
import { JourneyResults } from './components/JourneyResults.tsx'
import { StationDescription } from './components/StationDescription.tsx'
import {
  lines,
  dataDate,
  scheduleFile,
  datasetLabel,
  isSampleData,
  regions,
  stationById,
  stationLines,
  stations,
} from './data/railway.ts'
import { findConnection, searchStations } from './lib/railway.ts'
import {
  buildConnectionSegments,
  buildJourneySegments,
} from './lib/route-segments.ts'
import { findJourneys, journeyStops } from './lib/timetable.ts'
import type { TimetableIndex } from './lib/timetable.ts'
import { loadTimetable } from './lib/load-timetable.ts'

const initialDeparture =
  stations.find((station) => station.name === '서울')?.id ?? stations[0].id
const initialArrival =
  stations.find((station) => station.name === '강릉')?.id ??
  stations[1]?.id ??
  initialDeparture
const favoriteKey = 'chicchicpokpok:favorites:v1'
function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(favoriteKey) ?? '[]')
    return Array.isArray(value)
      ? value.filter(
          (id): id is string => typeof id === 'string' && stationById.has(id),
        )
      : []
  } catch {
    return []
  }
}

export default function App() {
  const [tab, setTab] = useState<'stations' | 'route'>('stations')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('서울')
  const [selected, setSelected] = useState<string | null>(null)
  const [listPage, setListPage] = useState({ key: '', limit: 12 })
  const [favorites, setFavorites] = useState(readFavorites)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [departure, setDeparture] = useState(initialDeparture)
  const [arrival, setArrival] = useState(initialArrival)
  const [request, setRequest] = useState<{
    from: string
    to: string
    earliestTime: string
    minTransferMinutes: number
  } | null>(null)
  const [departureTime, setDepartureTime] = useState('00:00')
  const [transferMinutes, setTransferMinutes] = useState(10)
  const [timetable, setTimetable] = useState<TimetableIndex | null>(null)
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [loadError, setLoadError] = useState('')
  const [journeyChoice, setJourneyChoice] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const selectedStation = selected ? stationById.get(selected) : undefined

  useEffect(() => {
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(favorites))
    } catch {
      /* Favorites still work in memory when storage is unavailable. */
    }
  }, [favorites])

  const favoriteFilter = onlyFavorites ? favorites : null
  const filteredStations = useMemo(
    () =>
      searchStations(stations, query, region).filter(
        (station) => !favoriteFilter || favoriteFilter.includes(station.id),
      ),
    [query, region, favoriteFilter],
  )
  const listKey = `${region}|${query}|${onlyFavorites}`
  const listLimit = listPage.key === listKey ? listPage.limit : 12
  const journeys = useMemo(
    () =>
      !isSampleData && timetable && request
        ? findJourneys(timetable, request.from, request.to, {
            date: dataDate,
            earliestTime: request.earliestTime,
            minTransferMinutes: request.minTransferMinutes,
          })
        : [],
    [timetable, request],
  )
  const selectedJourney = journeys[journeyChoice] ?? null
  const selectedStops = useMemo(
    () => (selectedJourney ? journeyStops(selectedJourney) : []),
    [selectedJourney],
  )
  const connection = useMemo(
    () =>
      isSampleData
        ? request
          ? findConnection(lines, request.from, request.to)
          : null
        : selectedJourney
          ? selectedStops.map((stop) => stop.stationId)
          : null,
    [request, selectedJourney, selectedStops],
  )
  const connectionSegments = useMemo(
    () =>
      selectedJourney
        ? buildJourneySegments(selectedJourney, dataDate)
        : isSampleData
          ? buildConnectionSegments(lines, connection)
          : [],
    [connection, selectedJourney],
  )
  const routeStations = useMemo(
    () =>
      timetable
        ? [...timetable.stationNames]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        : stations,
    [timetable],
  )
  const mapCandidates = useMemo(
    () =>
      connection
        ? [
            ...new Map(
              connection.flatMap((id) => {
                const station = stationById.get(id)
                return station ? [[id, station] as const] : []
              }),
            ).values(),
          ]
        : filteredStations,
    [filteredStations, connection],
  )
  async function ensureTimetable() {
    if (isSampleData || timetable) return
    setLoadState('loading')
    setLoadError('')
    try {
      if (!scheduleFile)
        throw new Error('연결된 운행 자료가 없습니다. 새로고침해 주세요.')
      const index = await loadTimetable(
        import.meta.env.BASE_URL + scheduleFile,
        dataDate,
      )
      if (!mounted.current) return
      setTimetable(index)
      setLoadState('ready')
    } catch (error) {
      if (!mounted.current) return
      setLoadState('error')
      setLoadError(
        error instanceof Error
          ? error.message
          : '운행 자료를 불러오지 못했습니다.',
      )
    }
  }
  function openRoutes() {
    setTab('route')
    setSheetExpanded(true)
    void ensureTimetable()
  }
  const selectStation = useCallback((id: string) => setSelected(id), [])
  const toggleFavorite = (id: string) =>
    setFavorites((values) =>
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    )
  const chooseEndpoint = (endpoint: 'departure' | 'arrival') => {
    if (!selected) return
    if (endpoint === 'departure') setDeparture(selected)
    else setArrival(selected)
    setRequest(null)
    openRoutes()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="칙칙폭폭 홈"
        >
          <span className="brand-mark">
            <Icon name="train" size={26} />
          </span>
          <span>
            칙칙폭폭<small>CHICCHIC POKPOK</small>
          </span>
        </a>
        <p className="topbar-copy">익숙한 일상 밖, 새로운 정거장으로.</p>
        <button className="header-action" onClick={openRoutes}>
          <Icon name="route" size={18} />
          <span>경로 탐색</span>
          <Icon name="arrow" size={16} />
        </button>
      </header>

      <main className="workspace">
        <aside
          className={`sidebar ${sheetExpanded ? 'expanded' : ''} ${tab === 'route' ? 'planning' : ''}`}
          aria-label="기차역 검색과 경로 탐색"
        >
          <button
            className="sheet-handle"
            aria-label={sheetExpanded ? '검색 패널 접기' : '검색 패널 펼치기'}
            aria-expanded={sheetExpanded}
            onClick={() => setSheetExpanded((value) => !value)}
          >
            <span />
          </button>
          <div className="sidebar-heading">
            <span className="eyebrow">
              <span /> LET’S GO BY TRAIN
            </span>
            <h1>
              기차 타고,
              <br />
              어디로 떠나볼까요<span>?</span>
            </h1>
            <p>지도를 펼치면, 새로운 여행이 시작돼요.</p>
            <Icon name="train" size={86} className="heading-train" />
          </div>
          <div className="tabs" role="tablist" aria-label="탐색 방식">
            <button
              role="tab"
              id="stations-tab"
              aria-selected={tab === 'stations'}
              aria-controls="stations-panel"
              className={tab === 'stations' ? 'active' : ''}
              onClick={() => {
                setTab('stations')
                setRequest(null)
                setSelected(null)
              }}
            >
              <Icon name="pin" size={17} />
              기차역 찾기
            </button>
            <button
              role="tab"
              id="route-tab"
              aria-selected={tab === 'route'}
              aria-controls="route-panel"
              className={tab === 'route' ? 'active' : ''}
              onClick={openRoutes}
            >
              <Icon name="route" size={17} />
              연결 경로
            </button>
          </div>

          {tab === 'stations' ? (
            <section
              className="explore-panel"
              id="stations-panel"
              role="tabpanel"
              aria-labelledby="stations-tab"
            >
              <div className="search-wrap">
                <Icon name="search" size={20} />
                <input
                  aria-label="기차역 또는 지역 검색"
                  placeholder="어떤 역으로 떠나고 싶으세요?"
                  value={query}
                  onChange={(event) => {
                    if (!query.trim() && event.target.value.trim())
                      setRegion('전체')
                    setQuery(event.target.value)
                    setSelected(null)
                  }}
                />
                {query && (
                  <button
                    aria-label="검색어 지우기"
                    onClick={() => {
                      setQuery('')
                      setSelected(null)
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
              <div className="region-chips" aria-label="지역 필터">
                {regions.map((value) => (
                  <button
                    key={value}
                    aria-pressed={region === value}
                    className={region === value ? 'active' : ''}
                    onClick={() => {
                      setRegion(value)
                      setSelected(null)
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="results-heading">
                <h2>
                  {onlyFavorites
                    ? '내가 담은 기차역'
                    : region === '전체'
                      ? '새로운 여행의 출발점'
                      : `${region}의 기차역`}{' '}
                  <span>{filteredStations.length}</span>
                </h2>
                <button
                  className={
                    onlyFavorites
                      ? 'favorites-filter active'
                      : 'favorites-filter'
                  }
                  aria-pressed={onlyFavorites}
                  onClick={() => setOnlyFavorites((value) => !value)}
                >
                  <Icon name="star" size={15} />
                  즐겨찾기
                </button>
              </div>
              <div
                className="station-list"
                aria-label="기차역 검색 결과"
                aria-live="polite"
              >
                {filteredStations.slice(0, listLimit).map((station) => (
                  <article
                    className={`station-card ${selected === station.id ? 'selected' : ''}`}
                    key={station.id}
                  >
                    <button
                      className="station-main"
                      aria-label={`${station.name}역 상세 보기`}
                      aria-pressed={selected === station.id}
                      onClick={() => selectStation(station.id)}
                    >
                      <span className="station-symbol">
                        <Icon name="train" size={22} />
                      </span>
                      <span className="station-copy">
                        <strong>
                          {station.name}
                          <span>역</span>
                        </strong>
                        <small>{station.area}</small>
                        <span className="line-tags">
                          {stationLines(station.id).map((line) => (
                            <span key={line.id}>
                              <i style={{ background: line.color }} />
                              {line.name}
                            </span>
                          ))}
                        </span>
                      </span>
                      <Icon
                        name="chevron"
                        size={16}
                        className="station-chevron"
                      />
                    </button>
                    <button
                      className={`favorite-button ${favorites.includes(station.id) ? 'saved' : ''}`}
                      aria-label={`${station.name}역 즐겨찾기 ${favorites.includes(station.id) ? '삭제' : '추가'}`}
                      aria-pressed={favorites.includes(station.id)}
                      onClick={() => toggleFavorite(station.id)}
                    >
                      <Icon name="star" size={18} />
                    </button>
                  </article>
                ))}
                {filteredStations.length > listLimit && (
                  <button
                    className="load-more-stations"
                    onClick={() =>
                      setListPage({ key: listKey, limit: listLimit + 12 })
                    }
                  >
                    기차역 더 보기{' '}
                    <span>
                      {listLimit} / {filteredStations.length}
                    </span>
                  </button>
                )}
                {!filteredStations.length && (
                  <div className="empty-state">
                    <Icon name={onlyFavorites ? 'star' : 'search'} size={32} />
                    <h3>
                      {onlyFavorites
                        ? '아직 담아 둔 역이 없어요'
                        : '찾으시는 역이 없어요'}
                    </h3>
                    <p>
                      {onlyFavorites
                        ? '기차역 옆 별을 눌러 여행의 시작을 담아 보세요.'
                        : '다른 이름으로 검색하거나 지역을 바꿔 보세요.'}
                    </p>
                    <button
                      onClick={() => {
                        setQuery('')
                        setRegion('전체')
                        setOnlyFavorites(false)
                      }}
                    >
                      전체 기차역 보기
                      <Icon name="arrow" size={15} />
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section
              className={`route-panel ${selectedJourney ? 'has-result' : ''}`}
              id="route-panel"
              role="tabpanel"
              aria-labelledby="route-tab"
            >
              <form
                className="route-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  setJourneyChoice(0)
                  setSheetExpanded(false)
                  setRequest({
                    from: departure,
                    to: arrival,
                    earliestTime: departureTime,
                    minTransferMinutes: transferMinutes,
                  })
                  setSelected(stationById.has(arrival) ? arrival : null)
                }}
              >
                <label>
                  <span>
                    <i className="endpoint-dot" />
                    출발역
                  </span>
                  <select
                    aria-label="출발역"
                    value={departure}
                    onChange={(event) => {
                      setDeparture(event.target.value)
                      setRequest(null)
                    }}
                  >
                    {routeStations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}역
                      </option>
                    ))}
                  </select>
                </label>
                <div className="route-divider">
                  <span />
                  <button
                    type="button"
                    aria-label="출발역과 도착역 바꾸기"
                    onClick={() => {
                      setDeparture(arrival)
                      setArrival(departure)
                      setRequest(null)
                    }}
                  >
                    <Icon name="swap" size={17} />
                  </button>
                  <span />
                </div>
                <label>
                  <span>
                    <i className="endpoint-dot arrival" />
                    도착역
                  </span>
                  <select
                    aria-label="도착역"
                    value={arrival}
                    onChange={(event) => {
                      setArrival(event.target.value)
                      setRequest(null)
                    }}
                  >
                    {routeStations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}역
                      </option>
                    ))}
                  </select>
                </label>
                {!isSampleData && (
                  <>
                    <p className="timetable-date">
                      {dataDate.slice(0, 4)}.{dataDate.slice(4, 6)}.
                      {dataDate.slice(6, 8)} 운행 기록 기준 · 직통 우선
                    </p>
                    {!!timetable?.excludedTripCount && (
                      <p className="timetable-date">
                        시각을 검증할 수 없는 {timetable.excludedTripCount}편은
                        검색에서 제외했습니다.
                      </p>
                    )}
                    <div className="route-time-fields">
                      <label>
                        출발 시각 이후
                        <input
                          type="time"
                          aria-label="출발 시각 이후"
                          value={departureTime}
                          onChange={(event) => {
                            setDepartureTime(event.target.value)
                            setRequest(null)
                          }}
                          required
                        />
                      </label>
                      <label>
                        최소 환승 여유
                        <select
                          aria-label="최소 환승 여유"
                          value={transferMinutes}
                          onChange={(event) => {
                            setTransferMinutes(Number(event.target.value))
                            setRequest(null)
                          }}
                        >
                          <option value={10}>10분</option>
                          <option value={20}>20분</option>
                          <option value={30}>30분</option>
                        </select>
                      </label>
                    </div>
                  </>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    departure === arrival ||
                    (!isSampleData && loadState !== 'ready')
                  }
                >
                  연결 경로 보기
                  <Icon name="arrow" size={18} />
                </button>
                {departure === arrival && (
                  <p className="form-hint">
                    출발역과 다른 도착역을 선택해 주세요.
                  </p>
                )}
              </form>
              <div className="route-results" aria-live="polite">
                {!isSampleData ? (
                  <JourneyResults
                    loadState={loadState}
                    error={loadError}
                    onRetry={() => void ensureTimetable()}
                    requested={!!request}
                    options={journeys}
                    selectedIndex={journeyChoice}
                    onChoose={setJourneyChoice}
                    segments={connectionSegments}
                    date={dataDate}
                    onExpand={() => setSheetExpanded(true)}
                  />
                ) : request && connection ? (
                  <>
                    <div className="connection-heading">
                      <span className="eyebrow">YOUR NEXT JOURNEY</span>
                      <h2>
                        {stationById.get(request.from)!.name}
                        <Icon name="arrow" size={20} />
                        {stationById.get(request.to)!.name}
                      </h2>
                      <p>
                        {datasetLabel}에서 {connection.length}개 역을
                        연결했어요.
                      </p>
                      <p>
                        {connectionSegments.length}개 색상 구간 · 열차 경로 후보
                      </p>
                    </div>
                    <ol className="connection-stops">
                      {connection.map((id, index) => {
                        const segment =
                          connectionSegments.find(
                            (segment) =>
                              index >= segment.startIndex &&
                              index < segment.endIndex,
                          ) ?? connectionSegments.at(-1)
                        const beginsSegment = segment?.startIndex === index
                        const changesPath = index > 0 && beginsSegment
                        return (
                          <li
                            key={id}
                            className={changesPath ? 'route-change-stop' : ''}
                            style={
                              {
                                '--route-color': segment?.color,
                              } as CSSProperties
                            }
                          >
                            <span
                              className={`stop-dot ${index === 0 || index === connection.length - 1 ? 'endpoint' : ''}`}
                            />
                            <div>
                              <strong>{stationById.get(id)!.name}역</strong>
                              <small>{stationById.get(id)!.area}</small>
                              {beginsSegment && (
                                <small className="route-train-label">
                                  {segment.label}
                                </small>
                              )}
                            </div>
                            {index === 0 ? (
                              <span className="stop-label">출발</span>
                            ) : changesPath ? (
                              <span
                                className="stop-label route-change-label"
                                title="색상이 바뀌는 경로 전환 지점입니다. 실제 환승 가능 여부와 대기시간은 시간표를 확인하세요."
                              >
                                경로 전환
                              </span>
                            ) : index === connection.length - 1 ? (
                              <span className="stop-label">도착</span>
                            ) : null}
                          </li>
                        )
                      })}
                    </ol>
                  </>
                ) : request ? (
                  <div className="empty-state">
                    <Icon name="route" size={32} />
                    <h3>연결된 경로가 없어요</h3>
                    <p>다른 역을 선택해 주세요.</p>
                  </div>
                ) : (
                  <div className="route-intro">
                    <span className="route-intro-icon">
                      <Icon name="route" size={34} />
                    </span>
                    <h2>철길을 따라, 새로운 곳으로</h2>
                    <p>
                      출발역과 도착역을 선택하고
                      <br />
                      어떤 역으로 이어지는지 살펴보세요.
                    </p>
                  </div>
                )}
              </div>
              <p className="route-note">
                <Icon name="info" size={16} />
                <span>
                  {isSampleData
                    ? '샘플 철도망입니다. 실제 탑승 열차나 환승 시간표가 아닙니다.'
                    : '표시된 날짜의 운행 기록입니다. 좌표가 없는 정차역도 목록에 보존하며 지도에서는 일부 선이 생략됩니다. 좌석·운행 변경·실제 환승 가능 여부는 코레일에서 확인해 주세요.'}
                </span>
              </p>
            </section>
          )}
          <footer className="sidebar-footer">
            <span>
              <span className="status-dot" />
              {datasetLabel}
            </span>
            <span>
              {stations.length}개 역 ·{' '}
              {isSampleData ? '실제 운행 정보 아님' : '실시간 정보 아님'}
            </span>
          </footer>
        </aside>

        <div className="map-area">
          <RailMap
            selected={selected}
            scopeStations={mapCandidates}
            overview={
              region === '전체' &&
              !query.trim() &&
              !onlyFavorites &&
              !connection
            }
            connection={connection}
            segments={connectionSegments}
            onSelect={selectStation}
          />
          {selectedStation && (
            <div className="selected-station-panel" aria-label="선택한 기차역">
              <div className="selection-top">
                <span className="eyebrow">YOUR NEXT STOP</span>
                <button
                  aria-label="기차역 선택 해제"
                  onClick={() => setSelected(null)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="selection-title">
                <span className="selection-icon">
                  <Icon name="train" size={25} />
                </span>
                <div>
                  <h2>
                    {selectedStation.name}
                    <span>역</span>
                  </h2>
                  <p>
                    <Icon name="pin" size={12} />
                    {selectedStation.area}
                  </p>
                </div>
                <button
                  className={`favorite-button ${favorites.includes(selectedStation.id) ? 'saved' : ''}`}
                  aria-label={`선택한 ${selectedStation.name}역 즐겨찾기 ${favorites.includes(selectedStation.id) ? '삭제' : '추가'}`}
                  onClick={() => toggleFavorite(selectedStation.id)}
                  aria-pressed={favorites.includes(selectedStation.id)}
                >
                  <Icon name="star" size={20} />
                </button>
              </div>
              <StationDescription
                key={selectedStation.id}
                text={selectedStation.description}
              />
              <div className="selection-actions">
                <button onClick={() => chooseEndpoint('departure')}>
                  출발역으로
                </button>
                <button onClick={() => chooseEndpoint('arrival')}>
                  도착역으로
                  <Icon name="arrow" size={15} />
                </button>
              </div>
            </div>
          )}
          {selectedStation && (
            <div className="mobile-selection">
              <span>
                <strong>{selectedStation.name}역</strong>
                <small>{selectedStation.area}</small>
              </span>
              <button onClick={() => chooseEndpoint('departure')}>출발</button>
              <button onClick={() => chooseEndpoint('arrival')}>
                도착
                <Icon name="arrow" size={14} />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
