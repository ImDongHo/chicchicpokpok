import { stationLabel } from './lib/station-labels.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './components/Icon.tsx'
import { RailMap } from './components/RailMap.tsx'
import { JourneyResults } from './components/JourneyResults.tsx'
import { DiscoveryPanel } from './components/DiscoveryPanel.tsx'
import { ServiceExplorer } from './components/ServiceExplorer.tsx'
import type { ServicePreview } from './components/ServiceExplorer.tsx'
import { TrainTypeFilter } from './components/TrainTypeFilter.tsx'
import { DEFAULT_TRAIN_FILTER, trainFilterLabel } from './lib/train-filter.ts'
import type { TrainFilter } from './lib/train-filter.ts'
import type { JourneyPreference } from './types.ts'
import type { JourneySearchOptions } from './lib/timetable.ts'
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
import {
  readAppNavigation,
  readExplorerNavigation,
  writeAppNavigation,
} from './lib/app-navigation.ts'
import type { AppTab } from './lib/app-navigation.ts'

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
  const [tab, setTab] = useState<AppTab>(
    () => readAppNavigation(window.history.state)?.tab ?? 'stations',
  )
  const restoreTimetableOnMount = useRef(tab !== 'stations')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('서울')
  const [selected, setSelected] = useState<string | null>(null)
  const [listPage, setListPage] = useState({ key: '', limit: 12 })
  const [favorites, setFavorites] = useState(readFavorites)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [departure, setDeparture] = useState(initialDeparture)
  const [arrival, setArrival] = useState(initialArrival)
  const [request, setRequest] = useState<
    | (Omit<JourneySearchOptions, 'date' | 'limit'> & {
        from: string
        to: string
      })
    | null
  >(null)
  const [preference, setPreference] =
    useState<JourneyPreference>('fewest-transfers')
  const [discoveryPreview, setDiscoveryPreview] = useState<string[]>([])
  const [networkInitialStation, setNetworkInitialStation] =
    useState(initialDeparture)
  const [networkSession, setNetworkSession] = useState(0)
  const [networkPreview, setNetworkPreview] = useState<ServicePreview>({
    ids: [],
    journey: null,
    overview: false,
  })
  const previewNetwork = useCallback((preview: ServicePreview) => {
    setNetworkPreview(preview)
    setSelected(null)
  }, [])
  const previewDiscovery = useCallback((ids: string[]) => {
    setDiscoveryPreview(ids)
    setSelected((current) =>
      current && ids.includes(current) ? current : null,
    )
  }, [])
  const [departureTime, setDepartureTime] = useState('00:00')
  const [transferMinutes, setTransferMinutes] = useState(10)
  const [trainFilter, setTrainFilter] =
    useState<TrainFilter>(DEFAULT_TRAIN_FILTER)
  const [timetable, setTimetable] = useState<TimetableIndex | null>(null)
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >(() => (!isSampleData && tab !== 'stations' ? 'loading' : 'idle'))
  const [loadError, setLoadError] = useState('')
  const [journeyChoice, setJourneyChoice] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [sheetExpanded, setSheetExpanded] = useState(
    () =>
      readAppNavigation(window.history.state)?.tab === 'network' &&
      (readExplorerNavigation(window.history.state, dataDate)?.depth ?? 0) < 2,
  )
  const inspectNetwork = useCallback(() => setSheetExpanded(false), [])
  const expandNetwork = useCallback(() => setSheetExpanded(true), [])
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
            ...request,
            date: dataDate,
          })
        : [],
    [timetable, request],
  )
  const selectedJourney = journeys[journeyChoice] ?? null
  const displayedJourney =
    tab === 'network' ? networkPreview.journey : selectedJourney
  const selectedStops = useMemo(
    () => (displayedJourney ? journeyStops(displayedJourney) : []),
    [displayedJourney],
  )
  const connection = useMemo(
    () =>
      isSampleData
        ? request
          ? findConnection(lines, request.from, request.to)
          : null
        : displayedJourney
          ? selectedStops.map((stop) => stop.stationId)
          : null,
    [request, displayedJourney, selectedStops],
  )
  const connectionSegments = useMemo(
    () =>
      displayedJourney
        ? buildJourneySegments(displayedJourney, dataDate)
        : isSampleData
          ? buildConnectionSegments(lines, connection)
          : [],
    [connection, displayedJourney],
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
      tab === 'network'
        ? [...new Set(networkPreview.ids)].flatMap((id) => {
            const station = stationById.get(id)
            return station ? [station] : []
          })
        : tab === 'discover'
          ? discoveryPreview.flatMap((id) => {
              const station = stationById.get(id)
              return station ? [station] : []
            })
          : connection
            ? [
                ...new Map(
                  connection.flatMap((id) => {
                    const station = stationById.get(id)
                    return station ? [[id, station] as const] : []
                  }),
                ).values(),
              ]
            : filteredStations,
    [filteredStations, connection, tab, discoveryPreview, networkPreview.ids],
  )
  const ensureTimetable = useCallback(async () => {
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
  }, [timetable])
  useEffect(() => {
    const current = readAppNavigation(window.history.state)
    if (!current) writeAppNavigation({ version: 1, tab }, 'replace')
    else if (current.tab !== tab)
      writeAppNavigation({ version: 1, tab }, 'push')
  }, [tab])
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const navigation = readAppNavigation(event.state)
      if (!navigation) return
      setTab(navigation.tab)
      setSelected(null)
      if (navigation.tab === 'network')
        setSheetExpanded(
          (readExplorerNavigation(event.state, dataDate)?.depth ?? 0) < 2,
        )
      if (navigation.tab !== 'stations') void ensureTimetable()
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [ensureTimetable])
  useEffect(() => {
    if (!restoreTimetableOnMount.current || isSampleData || !scheduleFile)
      return
    let active = true
    void loadTimetable(import.meta.env.BASE_URL + scheduleFile, dataDate).then(
      (index) => {
        if (!active) return
        setTimetable(index)
        setLoadState('ready')
      },
      (error: unknown) => {
        if (!active) return
        setLoadState('error')
        setLoadError(
          error instanceof Error
            ? error.message
            : '운행 자료를 불러오지 못했습니다.',
        )
      },
    )
    return () => {
      active = false
    }
  }, [])
  function openRoutes() {
    setTab('route')
    setSheetExpanded(true)
    void ensureTimetable()
  }
  function openDiscovery() {
    setTab('discover')
    setSheetExpanded(true)
    setRequest(null)
    setSelected(null)
    setDiscoveryPreview([departure])
    void ensureTimetable()
  }
  function openNetwork(stationId = selected ?? departure) {
    writeAppNavigation({ version: 1, tab: 'network' }, 'push')
    setNetworkSession((version) => version + 1)
    setNetworkInitialStation(stationId)
    setNetworkPreview({ ids: [], journey: null, overview: true })
    setTab('network')
    setRequest(null)
    setSelected(null)
    setSheetExpanded(true)
    void ensureTimetable()
  }
  function chooseRecommendedRoute(
    from: string,
    to: string,
    options: JourneySearchOptions,
  ) {
    setDeparture(from)
    setArrival(to)
    setDepartureTime(options.earliestTime ?? '00:00')
    setTransferMinutes(options.minTransferMinutes ?? 10)
    setPreference(options.preference ?? 'fastest')
    setTrainFilter(options.trainFilter ?? DEFAULT_TRAIN_FILTER)
    setJourneyChoice(0)
    setRequest({ ...options, from, to })
    setSelected(null)
    setTab('route')
    setSheetExpanded(false)
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
          className={`sidebar ${sheetExpanded ? 'expanded' : ''} ${tab !== 'stations' ? 'planning' : ''}`}
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
              기차 타고 떠나볼까요<span>?</span>
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
            <button
              role="tab"
              id="discovery-tab"
              aria-selected={tab === 'discover'}
              aria-controls="discovery-panel"
              className={tab === 'discover' ? 'active' : ''}
              onClick={openDiscovery}
            >
              <Icon name="map" size={17} />
              여행지 추천
            </button>
            <button
              role="tab"
              id="network-tab"
              aria-selected={tab === 'network'}
              aria-controls="network-panel"
              className={tab === 'network' ? 'active' : ''}
              onClick={() => {
                if (tab !== 'network') openNetwork()
              }}
            >
              <Icon name="train" size={17} />
              노선 탐색
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
              <div className="region-chips-wrap">
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
                      aria-label={`${stationLabel(station.name)}역 상세 보기`}
                      aria-pressed={selected === station.id}
                      onClick={() => selectStation(station.id)}
                    >
                      <span className="station-symbol">
                        <Icon name="train" size={22} />
                      </span>
                      <span className="station-copy">
                        <strong>
                          {stationLabel(station.name)}
                          <span>역</span>
                        </strong>
                        <small>{station.area}</small>
                        <span
                          className="line-tags"
                          title={stationLines(station.id)
                            .map((line) => line.name)
                            .join(', ')}
                        >
                          {stationLines(station.id)
                            .slice(0, 3)
                            .map((line) => (
                              <span key={line.id}>
                                <i style={{ background: line.color }} />
                                {line.name}
                              </span>
                            ))}
                          {stationLines(station.id).length > 3 && (
                            <span
                              className="line-overflow-badge"
                              aria-label={`외 ${stationLines(station.id).length - 3}개 노선`}
                            >
                              +{stationLines(station.id).length - 3}
                            </span>
                          )}
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
                      aria-label={`${stationLabel(station.name)}역 즐겨찾기 ${favorites.includes(station.id) ? '삭제' : '추가'}`}
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
          ) : tab === 'route' ? (
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
                    preference,
                    trainFilter,
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
                        {stationLabel(station.name)}역
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
                        {stationLabel(station.name)}역
                      </option>
                    ))}
                  </select>
                </label>
                {!isSampleData && (
                  <>
                    <p className="timetable-date">
                      {dataDate.slice(0, 4)}.{dataDate.slice(4, 6)}.
                      {dataDate.slice(6, 8)} 운행 기록 기준 ·{' '}
                      {preference === 'fastest'
                        ? '빠른 도착 우선'
                        : '적은 환승 우선'}
                    </p>
                    {!!timetable?.excludedTripCount && (
                      <p className="timetable-date">
                        시각을 검증할 수 없는 {timetable.excludedTripCount}편은
                        검색에서 제외했습니다.
                      </p>
                    )}
                  </>
                )}
                {!isSampleData && (
                  <TrainTypeFilter
                    value={trainFilter}
                    types={timetable?.trainTypes ?? []}
                    onChange={(value) => {
                      setTrainFilter(value)
                      setJourneyChoice(0)
                      setRequest(null)
                    }}
                  />
                )}
                {!isSampleData && (
                  <details className="route-options">
                    <summary>
                      상세 옵션
                      <small>시간 · 환승 · 정렬</small>
                      <Icon name="chevron" size={16} />
                    </summary>
                    <div className="route-options-body">
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
                      <div
                        className="journey-preference"
                        role="group"
                        aria-label="경로 정렬 기준"
                      >
                        {(
                          [
                            { value: 'fastest', label: '빠른 도착' },
                            { value: 'fewest-transfers', label: '적은 환승' },
                          ] as const
                        ).map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            aria-pressed={preference === option.value}
                            onClick={() => {
                              setPreference(option.value)
                              setJourneyChoice(0)
                              setRequest((previous) =>
                                previous
                                  ? { ...previous, preference: option.value }
                                  : null,
                              )
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="preference-hint">
                        {preference === 'fastest'
                          ? '요청 시각 이후 가장 빨리 도착하는 편을 비교합니다.'
                          : '환승 횟수를 먼저, 같은 횟수에서는 빠른 도착을 비교합니다.'}
                      </p>
                      {request?.maxDurationMinutes && (
                        <p className="preference-hint">
                          추천 조건: 편도 {request.maxDurationMinutes / 60}시간
                          이내 · 환승 {request.maxTransfers ?? 2}회까지
                          {request.latestArrivalTime
                            ? ` · ${request.latestArrivalTime}까지 도착`
                            : ''}
                          . 다시 검색하면 추천 조건이 해제됩니다.
                        </p>
                      )}
                    </div>
                  </details>
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
                    filterLabel={
                      request?.trainFilter
                        ? trainFilterLabel(request.trainFilter)
                        : undefined
                    }
                    onExpand={() => setSheetExpanded(true)}
                  />
                ) : request && connection ? (
                  <>
                    <div className="connection-heading">
                      <span className="eyebrow">YOUR NEXT JOURNEY</span>
                      <h2>
                        {stationLabel(stationById.get(request.from)!.name)}
                        <Icon name="arrow" size={20} />
                        {stationLabel(stationById.get(request.to)!.name)}
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
                              <strong>
                                {stationLabel(stationById.get(id)!.name)}역
                              </strong>
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
              <details className="route-note">
                <summary>
                  <Icon name="info" size={16} />
                  운행 기록 안내
                  <Icon name="chevron" size={16} />
                </summary>
                <p>
                  {isSampleData
                    ? '샘플 철도망입니다. 실제 탑승 열차나 환승 시간표가 아닙니다.'
                    : '표시된 날짜의 운행 기록입니다. 좌표가 없는 정차역도 목록에 보존하며, 위치 미확인 중간역을 포함한 지도 구간은 옅은 점선으로 연결합니다. 좌석·운행 변경·실제 환승 가능 여부는 코레일에서 확인해 주세요.'}
                </p>
              </details>
            </section>
          ) : tab === 'discover' ? (
            <DiscoveryPanel
              stations={stations}
              regions={regions}
              date={dataDate}
              initialFrom={departure}
              sample={isSampleData}
              index={timetable}
              loadState={loadState}
              error={loadError}
              onRetry={() => void ensureTimetable()}
              onPreview={previewDiscovery}
              onSelect={chooseRecommendedRoute}
            />
          ) : (
            <ServiceExplorer
              key={`${networkInitialStation}:${networkSession}`}
              stations={stations}
              regions={regions}
              index={timetable}
              date={dataDate}
              sample={isSampleData}
              initialStation={networkInitialStation}
              loadState={loadState}
              error={loadError}
              onRetry={() => void ensureTimetable()}
              onPreview={previewNetwork}
              onInspect={inspectNetwork}
              onExpand={expandNetwork}
            />
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

        <div className={`map-area ${connection ? 'showing-route' : ''}`}>
          <RailMap
            idleHint={
              tab === 'network'
                ? '열차 종류 → 방면을 고르면 전체 경로가 나타납니다.'
                : undefined
            }
            selected={selected}
            scopeStations={mapCandidates}
            overview={
              tab === 'network'
                ? networkPreview.overview && !connection
                : tab !== 'discover' &&
                  region === '전체' &&
                  !query.trim() &&
                  !onlyFavorites &&
                  !connection
            }
            connection={connection}
            segments={connectionSegments}
            endpoints={
              connection
                ? {
                    departure:
                      selectedStops[0]?.name ??
                      stationById.get(connection[0])?.name ??
                      '출발',
                    arrival:
                      selectedStops.at(-1)?.name ??
                      stationById.get(connection.at(-1)!)?.name ??
                      '도착',
                  }
                : null
            }
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
                    {stationLabel(selectedStation.name)}
                    <span>역</span>
                  </h2>
                  <p>
                    <Icon name="pin" size={12} />
                    {selectedStation.area}
                  </p>
                </div>
                <button
                  className={`favorite-button ${favorites.includes(selectedStation.id) ? 'saved' : ''}`}
                  aria-label={`선택한 ${stationLabel(selectedStation.name)}역 즐겨찾기 ${favorites.includes(selectedStation.id) ? '삭제' : '추가'}`}
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
              <button
                className="service-explorer-link"
                onClick={() => openNetwork(selectedStation.id)}
              >
                이 역의 전체 운행 열차 보기 <Icon name="arrow" size={15} />
              </button>
            </div>
          )}
          {selectedStation && (
            <div className="mobile-selection">
              <span>
                <strong>{stationLabel(selectedStation.name)}역</strong>
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
