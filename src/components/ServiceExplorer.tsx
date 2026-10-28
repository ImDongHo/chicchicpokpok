import { useEffect, useMemo, useRef, useState } from 'react'
import type { Journey, Station } from '../types.ts'
import type { TimetableIndex } from '../lib/timetable.ts'
import {
  formatKoreaTime,
  fullServiceJourney,
  parseKoreaTime,
} from '../lib/timetable.ts'
import {
  explorerStations,
  findExplorerServices,
  scopedMapStations,
} from '../lib/service-explorer.ts'
import type { ServiceScope } from '../lib/service-explorer.ts'
import { DEFAULT_TRAIN_FILTER } from '../lib/train-filter.ts'
import { stationLabel } from '../lib/station-labels.ts'
import { trainTypeLabel } from '../lib/train-labels.ts'
import { buildJourneySegments } from '../lib/route-segments.ts'
import { TrainTypeFilter } from './TrainTypeFilter.tsx'
import { JourneyResults } from './JourneyResults.tsx'
import { Icon } from './Icon.tsx'

export interface ServicePreview {
  ids: string[]
  journey: Journey | null
  overview: boolean
}

interface Props {
  stations: Station[]
  regions: readonly string[]
  index: TimetableIndex | null
  date: string
  sample: boolean
  initialStation: string
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  onRetry: () => void
  onPreview: (preview: ServicePreview) => void
  onInspect: () => void
  onExpand: () => void
}

const PAGE_SIZE = 12

export function ServiceExplorer({
  stations,
  regions,
  index,
  date,
  sample,
  initialStation,
  loadState,
  error,
  onRetry,
  onPreview,
  onInspect,
  onExpand,
}: Props) {
  const [form, setForm] = useState({
    mode: 'station' as ServiceScope['mode'],
    stationId: initialStation,
    region:
      stations.find((station) => station.id === initialStation)?.region ??
      '서울',
    query: '',
    trainFilter: DEFAULT_TRAIN_FILTER,
  })
  const [page, setPage] = useState(0)
  const panelRef = useRef<HTMLElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const stationOptions = useMemo(
    () => explorerStations(index, stations),
    [index, stations],
  )
  const scope = useMemo<ServiceScope>(
    () =>
      form.mode === 'station'
        ? { mode: 'station', stationId: form.stationId }
        : form.mode === 'region'
          ? { mode: 'region', region: form.region }
          : { mode: 'all' },
    [form.mode, form.stationId, form.region],
  )
  const services = useMemo(
    () =>
      index
        ? findExplorerServices(index, stations, {
            scope,
            query: form.query,
            trainFilter: form.trainFilter,
          })
        : [],
    [index, stations, scope, form.query, form.trainFilter],
  )
  const selected = useMemo(
    () => (index && selectedId ? fullServiceJourney(index, selectedId) : null),
    [index, selectedId],
  )
  const segments = useMemo(
    () => (selected ? buildJourneySegments(selected, date) : []),
    [selected, date],
  )
  const scopeStations = useMemo(
    () => scopedMapStations(stations, scope),
    [stations, scope],
  )
  useEffect(() => {
    onPreview({
      ids: selected
        ? selected.legs[0].stops.map((stop) => stop.stationId)
        : scopeStations.map((station) => station.id),
      journey: selected,
      overview: form.mode === 'all',
    })
  }, [selected, scopeStations, form.mode, onPreview])
  const update = (patch: Partial<typeof form>) => {
    setForm((previous) => ({ ...previous, ...patch }))
    setSelectedId(null)
    setPage(0)
  }
  const count = Math.max(1, Math.ceil(services.length / PAGE_SIZE))
  const currentPage = Math.min(page, count - 1)
  const visible = services.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )
  const resetSelection = () => {
    setSelectedId(null)
    panelRef.current?.scrollTo({ top: 0 })
    onExpand()
  }
  const changePage = (next: number) => {
    setPage(next)
    if (panelRef.current && resultsRef.current)
      panelRef.current.scrollTop +=
        resultsRef.current.getBoundingClientRect().top -
        panelRef.current.getBoundingClientRect().top
  }
  return (
    <section
      ref={panelRef}
      className={`service-explorer ${selected ? 'has-service' : ''}`}
      id="network-panel"
      role="tabpanel"
      aria-labelledby="network-tab"
    >
      <div className="service-explorer-heading">
        <span className="eyebrow">철길을 따라 둘러보기</span>
        <h2>열차의 처음부터 끝까지</h2>
        <p>
          {sample
            ? '샘플 지도에서는 실제 운행 열차를 제공하지 않습니다.'
            : `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)} 운행 기록 기준`}
        </p>
      </div>
      <details className="service-scope-panel" open={!selected}>
        <summary>
          <Icon name="map" size={16} />
          {form.mode === 'all'
            ? '전국 운행 열차'
            : form.mode === 'region'
              ? `${form.region} 지역의 운행 열차`
              : `${stationLabel(stationOptions.find((station) => station.id === form.stationId)?.name ?? '선택한 역')}역의 운행 열차`}
          <Icon name="chevron" size={16} />
        </summary>
        <div className="service-scope-body">
          <div
            className="service-scope-buttons"
            role="group"
            aria-label="노선 탐색 범위"
          >
            {(
              [
                { value: 'station', label: '역 기준' },
                { value: 'region', label: '지역 기준' },
                { value: 'all', label: '전국' },
              ] as const
            ).map(({ value, label }) => (
              <button
                type="button"
                key={value}
                aria-pressed={form.mode === value}
                onClick={() => update({ mode: value })}
              >
                {label}
              </button>
            ))}
          </div>
          {form.mode === 'station' && (
            <label className="service-scope-field">
              정차역
              <select
                aria-label="노선 탐색 역"
                value={form.stationId}
                onChange={(event) => update({ stationId: event.target.value })}
              >
                {stationOptions.map(({ id, name }) => (
                  <option value={id} key={id}>
                    {stationLabel(name)}역
                  </option>
                ))}
              </select>
            </label>
          )}
          {form.mode === 'region' && (
            <label className="service-scope-field">
              정차 지역
              <select
                aria-label="노선 탐색 지역"
                value={form.region}
                onChange={(event) => update({ region: event.target.value })}
              >
                {regions
                  .filter((region) => region !== '전체')
                  .map((region) => (
                    <option key={region}>{region}</option>
                  ))}
              </select>
            </label>
          )}
          <div className="search-wrap service-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="운행 열차 검색"
              placeholder="열차번호 · 차종 · 정차역 검색"
              value={form.query}
              onChange={(event) => update({ query: event.target.value })}
            />
          </div>
          <TrainTypeFilter
            value={form.trainFilter}
            types={index?.trainTypes ?? []}
            onChange={(trainFilter) => update({ trainFilter })}
            hint="수집된 전체 운행 열차에서 선택한 차종을 찾습니다."
          />
        </div>
      </details>
      <p className="service-explorer-note">
        정차역을 이은 운행 경로입니다. 실제 선로 모양과 무정차 통과역은 표시하지
        않습니다. 지도에는 선택한 열차 1편만 표시합니다.
      </p>
      {form.mode === 'region' && (
        <p className="service-explorer-note">
          지역 기준은 위치가 확인된 정차역으로 분류합니다.
        </p>
      )}
      {form.mode === 'station' &&
        loadState === 'ready' &&
        scopeStations.length === 0 && (
          <p className="service-explorer-note">
            선택한 역의 지도 위치는 미확인입니다. 운행 열차와 정차 기록은
            목록에서 확인할 수 있어요.
          </p>
        )}
      {sample ? (
        <div className="empty-state">
          <Icon name="train" size={28} />
          <h3>수집된 운행 자료가 필요해요</h3>
          <p>
            배포 데이터에서 실제 열차의 전체 정차 순서를 확인할 수 있습니다.
          </p>
        </div>
      ) : loadState === 'error' ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <button onClick={onRetry}>다시 불러오기</button>
        </div>
      ) : loadState !== 'ready' ? (
        <p className="service-explorer-status" role="status">
          운행 기록을 불러오고 있습니다.
        </p>
      ) : selected ? (
        <div className="service-full-route" aria-live="polite">
          <JourneyResults
            loadState="ready"
            error=""
            onRetry={onRetry}
            requested
            options={[selected]}
            selectedIndex={0}
            onChoose={() => {}}
            segments={segments}
            date={date}
            onExpand={resetSelection}
            mode="full-service"
          />
        </div>
      ) : (
        <div className="service-results" aria-live="polite" ref={resultsRef}>
          <p className="service-result-count">
            조건에 맞는 총 {services.length}편
            {services.length > 0 &&
              ` · ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, services.length)}번째`}
          </p>
          {form.mode === 'all' && (
            <p className="service-explorer-note">
              전국의 열차를 12편씩 보여드립니다. 열차를 선택하면 전체 운행
              경로가 나타납니다.
            </p>
          )}
          {!services.length && (
            <div className="empty-state">
              <Icon name="search" size={28} />
              <h3>조건에 맞는 운행 기록이 없어요</h3>
              <p>
                역·지역·열차 종류나 검색어를 바꿔 보세요. 해당 역에 열차가
                운행하지 않는다는 뜻은 아닙니다.
              </p>
            </div>
          )}
          {visible.map((trip) => (
            <button
              className="service-card"
              key={trip.id}
              onClick={() => {
                setSelectedId(trip.id)
                panelRef.current?.scrollTo({ top: 0 })
                onInspect()
              }}
            >
              <span className="service-card-train">
                <Icon name="train" size={16} />
                {trainTypeLabel(trip) ?? '차종 미제공'} {trip.trainNumber}호
              </span>
              <strong>
                {stationLabel(trip.stops[0].name)}
                <Icon name="arrow" size={16} />
                {stationLabel(trip.stops.at(-1)!.name)}
              </strong>
              <span className="service-card-times">
                {formatKoreaTime(parseKoreaTime(trip.stops[0].departure), date)}{' '}
                →{' '}
                {formatKoreaTime(
                  parseKoreaTime(trip.stops.at(-1)!.arrival),
                  date,
                )}{' '}
                · 정차역 {trip.stops.length}개
              </span>
              <span className="service-card-action">
                전체 운행 경로 보기 <Icon name="arrow" size={14} />
              </span>
            </button>
          ))}
          {count > 1 && (
            <nav className="service-pagination" aria-label="운행 열차 페이지">
              <button
                disabled={currentPage === 0}
                onClick={() => changePage(currentPage - 1)}
              >
                이전
              </button>
              <span>
                {currentPage + 1} / {count}
              </span>
              <button
                disabled={currentPage + 1 >= count}
                onClick={() => changePage(currentPage + 1)}
              >
                다음
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  )
}
