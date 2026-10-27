import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from './components/Icon.tsx'
import { RailMap } from './components/RailMap.tsx'
import {
  lines,
  datasetLabel,
  isSampleData,
  regions,
  stationById,
  stationLines,
  stations,
} from './data/railway.ts'
import { findConnection, searchStations } from './lib/railway.ts'

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
  const [region, setRegion] = useState('전체')
  const [selected, setSelected] = useState<string | null>(initialDeparture)
  const [favorites, setFavorites] = useState(readFavorites)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [departure, setDeparture] = useState(initialDeparture)
  const [arrival, setArrival] = useState(initialArrival)
  const [request, setRequest] = useState<{ from: string; to: string } | null>(
    null,
  )
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const selectedStation = selected ? stationById.get(selected) : undefined

  useEffect(() => {
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(favorites))
    } catch {
      /* Favorites still work in memory when storage is unavailable. */
    }
  }, [favorites])

  const filteredStations = useMemo(
    () =>
      searchStations(stations, query, region).filter(
        (station) => !onlyFavorites || favorites.includes(station.id),
      ),
    [query, region, onlyFavorites, favorites],
  )
  const visibleIds = useMemo(
    () => new Set(filteredStations.map((station) => station.id)),
    [filteredStations],
  )
  const connection = useMemo(
    () => (request ? findConnection(lines, request.from, request.to) : null),
    [request],
  )
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
    setTab('route')
    setSheetExpanded(true)
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
        <button
          className="header-action"
          onClick={() => {
            setTab('route')
            setSheetExpanded(true)
          }}
        >
          <Icon name="route" size={18} />
          <span>경로 탐색</span>
          <Icon name="arrow" size={16} />
        </button>
      </header>

      <main className="workspace">
        <aside
          className={`sidebar ${sheetExpanded ? 'expanded' : ''}`}
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
              onClick={() => setTab('route')}
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
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    aria-label="검색어 지우기"
                    onClick={() => setQuery('')}
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
                    onClick={() => setRegion(value)}
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
                {filteredStations.map((station) => (
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
              className="route-panel"
              id="route-panel"
              role="tabpanel"
              aria-labelledby="route-tab"
            >
              <form
                className="route-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  setRequest({ from: departure, to: arrival })
                  setSelected(arrival)
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
                    {stations.map((station) => (
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
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}역
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={departure === arrival}
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
                {request && connection ? (
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
                    </div>
                    <ol className="connection-stops">
                      {connection.map((id, index) => (
                        <li key={id}>
                          <span
                            className={`stop-dot ${index === 0 || index === connection.length - 1 ? 'endpoint' : ''}`}
                          />
                          <div>
                            <strong>{stationById.get(id)!.name}역</strong>
                            <small>{stationById.get(id)!.area}</small>
                          </div>
                          {index === 0 ? (
                            <span className="stop-label">출발</span>
                          ) : index === connection.length - 1 ? (
                            <span className="stop-label">도착</span>
                          ) : null}
                        </li>
                      ))}
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
                  철도망의 연결 관계를 보여주는 미리보기입니다. 실제 정차역·직통
                  운행·환승·소요 시간은 운행 시간표에서 확인해야 합니다.
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
            visibleIds={visibleIds}
            connection={connection}
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
              <p className="station-description">
                {selectedStation.description}
              </p>
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
