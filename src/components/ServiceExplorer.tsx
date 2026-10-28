import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  groupExplorerServices,
  scopedMapStations,
} from '../lib/service-explorer.ts'
import type { ServiceScope } from '../lib/service-explorer.ts'
import {
  initialExplorerNavigation,
  navigationId,
  readExplorerNavigation,
  readAppNavigation,
  writeAppNavigation,
} from '../lib/app-navigation.ts'
import type { ExplorerForm, ExplorerNavigation } from '../lib/app-navigation.ts'
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
  const [navigation, setNavigation] = useState(
    () =>
      readExplorerNavigation(window.history.state, date) ??
      initialExplorerNavigation(
        date,
        initialStation,
        stations.find((station) => station.id === initialStation)?.region ??
          '서울',
      ),
  )
  const { form, page, familyId, routeId, selectedId } = navigation
  const panelRef = useRef<HTMLElement>(null),
    resultsRef = useRef<HTMLDivElement>(null)
  const scopeRef = useRef<HTMLDetailsElement>(null),
    advancedRef = useRef<HTMLDetailsElement>(null)
  const pendingRestore = useRef<ExplorerNavigation | null>(navigation)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const traversing = useRef(false)
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
  const families = useMemo(() => groupExplorerServices(services), [services])
  const family = families.find((group) => group.id === familyId)
  const route = family?.routes.find((group) => group.id === routeId)
  const allowedSelection =
    route?.services.some((trip) => trip.id === selectedId) === true
  const selected = useMemo(
    () =>
      index && allowedSelection && selectedId
        ? fullServiceJourney(index, selectedId)
        : null,
    [index, allowedSelection, selectedId],
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
      ids: selected ? selected.legs[0].stops.map((stop) => stop.stationId) : [],
      journey: selected,
      overview: !selected,
    })
  }, [selected, onPreview])
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      traversing.current = false
      if (readAppNavigation(event.state)?.tab !== 'network') return
      const entry =
        readExplorerNavigation(event.state, date) ??
        initialExplorerNavigation(
          date,
          initialStation,
          stations.find((station) => station.id === initialStation)?.region ??
            '서울',
        )
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      pendingRestore.current = entry
      setNavigation(entry)
      if (entry.depth === 2) onInspect()
      else onExpand()
    }
    window.addEventListener('popstate', restore)
    return () => {
      window.removeEventListener('popstate', restore)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [date, initialStation, stations, onInspect, onExpand])
  useLayoutEffect(() => {
    const entry = pendingRestore.current,
      panel = panelRef.current
    if (!entry || entry.id !== navigation.id || !panel || !index) return
    panel.scrollTop = entry.scrollTop
    const focused = entry.focus
      ? [
          ...panel.querySelectorAll<HTMLButtonElement>(
            '[data-service-family], [data-service-route]',
          ),
        ].find((button) =>
          entry.focus?.kind === 'family'
            ? button.dataset.serviceFamily === entry.focus.id
            : button.dataset.serviceRoute === entry.focus?.id,
        )
      : panel.querySelector<HTMLButtonElement>('.service-back-button')
    focused?.focus({ preventScroll: true })
    panel.scrollTop = entry.scrollTop
    pendingRestore.current = null
  }, [navigation.id, index])
  const capture = (focus = navigation.focus): ExplorerNavigation => ({
    ...navigation,
    scrollTop: panelRef.current?.scrollTop ?? 0,
    scopeOpen: scopeRef.current?.open ?? navigation.scopeOpen,
    advancedOpen: advancedRef.current?.open ?? navigation.advancedOpen,
    focus,
  })
  const replace = (entry: ExplorerNavigation) => {
    writeAppNavigation(
      { version: 1, tab: 'network', explorer: entry },
      'replace',
    )
    setNavigation(entry)
  }
  const push = (
    entry: ExplorerNavigation,
    focus: ExplorerNavigation['focus'],
  ) => {
    writeAppNavigation(
      { version: 1, tab: 'network', explorer: capture(focus) },
      'replace',
    )
    const next = { ...entry, id: navigationId(), scrollTop: 0, focus: null }
    writeAppNavigation({ version: 1, tab: 'network', explorer: next }, 'push')
    pendingRestore.current = next
    setNavigation(next)
  }
  const update = (patch: Partial<ExplorerForm>) =>
    replace({
      ...capture(),
      depth: 0,
      form: { ...form, ...patch },
      familyId: null,
      routeId: null,
      selectedId: null,
      page: 0,
      scopeOpen: true,
    })
  const back = (depth: 0 | 1) => {
    const current = readExplorerNavigation(window.history.state, date)
    if (current?.id === navigation.id && current.depth > depth) {
      if (traversing.current) return
      traversing.current = true
      window.history.go(depth - current.depth)
      return
    }
    const next = {
      ...capture(),
      id: navigationId(),
      depth,
      familyId: depth === 0 ? null : familyId,
      routeId: null,
      selectedId: null,
      scrollTop: 0,
    }
    pendingRestore.current = next
    replace(next)
    onExpand()
  }
  const resetRoute = () => back(1)
  const resetFamily = () => back(0)
  const saveScroll = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      const current = readExplorerNavigation(window.history.state, date)
      if (current?.id !== navigation.id || !panelRef.current) return
      writeAppNavigation(
        {
          version: 1,
          tab: 'network',
          explorer: { ...current, scrollTop: panelRef.current.scrollTop },
        },
        'replace',
      )
    }, 250)
  }
  const count = Math.max(1, Math.ceil((family?.routes.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(page, count - 1)
  const visibleRoutes =
    family?.routes.slice(
      currentPage * PAGE_SIZE,
      (currentPage + 1) * PAGE_SIZE,
    ) ?? []
  const changePage = (next: number) => {
    const position =
      panelRef.current && resultsRef.current
        ? panelRef.current.scrollTop +
          resultsRef.current.getBoundingClientRect().top -
          panelRef.current.getBoundingClientRect().top
        : 0
    replace({ ...capture(), page: next, scrollTop: position })
    if (panelRef.current && resultsRef.current)
      panelRef.current.scrollTop +=
        resultsRef.current.getBoundingClientRect().top -
        panelRef.current.getBoundingClientRect().top
  }
  return (
    <section
      ref={panelRef}
      onScroll={saveScroll}
      className={`service-explorer ${family ? 'has-service' : ''}`}
      id="network-panel"
      role="tabpanel"
      aria-labelledby="network-tab"
    >
      {family && (
        <div className="service-back-toolbar">
          <button
            className="service-back-button"
            onClick={selected ? resetRoute : resetFamily}
          >
            <Icon name="arrow" size={17} />
            <span>
              {selected
                ? `${family.label} 방면 목록으로`
                : '열차 종류 선택으로'}
            </span>
          </button>
          <span>{selected ? '전체 경로' : `${family.label} 방면`}</span>
        </div>
      )}
      <div className="service-explorer-heading">
        <h2>어떤 열차로 둘러볼까요?</h2>
        <p>
          {sample
            ? '샘플 지도에서는 실제 운행 열차를 제공하지 않습니다.'
            : `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)} 운행 기록 기준`}
        </p>
      </div>
      <details
        ref={scopeRef}
        className="service-scope-panel"
        open={navigation.scopeOpen}
        onToggle={(event) => {
          if (event.currentTarget.open !== navigation.scopeOpen)
            replace({ ...capture(), scopeOpen: event.currentTarget.open })
        }}
      >
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
              placeholder="정차역 · 열차 종류 · 열차번호"
              value={form.query}
              onChange={(event) => update({ query: event.target.value })}
            />
          </div>
          <details
            ref={advancedRef}
            className="service-advanced"
            open={navigation.advancedOpen}
            onToggle={(event) => {
              if (event.currentTarget.open !== navigation.advancedOpen)
                replace({
                  ...capture(),
                  advancedOpen: event.currentTarget.open,
                })
            }}
          >
            <summary>
              상세 필터
              <Icon name="chevron" size={14} />
            </summary>
            <TrainTypeFilter
              value={form.trainFilter}
              types={index?.trainTypes ?? []}
              onChange={(trainFilter) => update({ trainFilter })}
              hint="원하는 세부 차종이나 차종 미확인 포함 여부를 선택할 수 있어요."
            />
          </details>
        </div>
      </details>
      <details className="service-display-guide">
        <summary>
          <Icon name="info" size={14} />
          지도·열차 종류 안내
          <Icon name="chevron" size={12} />
        </summary>
        <p>
          차량 계열별로 묶어 보여드립니다. KTX 계열에는 이음·산천·청룡 등이
          포함되며, 운영사는 개별 열차편에서 확인해 주세요. 지도에는 선택한 열차
          1편의 정차역 연결 경로만 표시합니다. 실제 선로 모양이나 무정차
          통과역은 표시하지 않습니다.
        </p>
        {form.mode === 'region' && (
          <p>지역 기준은 위치가 확인된 정차역으로 분류합니다.</p>
        )}
      </details>
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
      ) : (
        <div className="service-results" ref={resultsRef}>
          {family && (
            <nav className="service-breadcrumbs" aria-label="노선 탐색 단계">
              <button onClick={resetFamily}>열차 종류</button>
              <Icon name="chevron" size={12} />
              {selected ? (
                <button onClick={resetRoute}>{family.label} 방면</button>
              ) : (
                <strong>{family.label}</strong>
              )}
            </nav>
          )}
          {selected && route ? (
            <div className="service-full-route" aria-live="polite">
              <label className="service-departure-picker">
                운행 열차 선택 · {route.services.length}편
                <select
                  aria-label="전체 경로 운행 열차 선택"
                  value={selectedId ?? ''}
                  onChange={(event) => {
                    replace({
                      ...capture(),
                      selectedId: event.target.value,
                      scrollTop: 0,
                    })
                    panelRef.current?.scrollTo({ top: 0 })
                  }}
                >
                  {route.services.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {formatKoreaTime(
                        parseKoreaTime(trip.stops[0].departure),
                        date,
                      )}{' '}
                      →{' '}
                      {formatKoreaTime(
                        parseKoreaTime(trip.stops.at(-1)!.arrival),
                        date,
                      )}{' '}
                      · {trainTypeLabel(trip) ?? '차종 미제공'}{' '}
                      {trip.trainNumber}호
                    </option>
                  ))}
                </select>
              </label>
              {route.patternCount > 1 && (
                <p className="service-explorer-note">
                  이 방면은 정차 패턴이 {route.patternCount}가지입니다. 선택한
                  열차의 실제 정차역을 보여드립니다.
                </p>
              )}
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
                onExpand={resetRoute}
                mode="full-service"
              />
            </div>
          ) : (
            <>
              <p className="service-result-count" role="status">
                {family
                  ? `${family.label} · ${family.routes.length}개 방면 · 총 ${family.services.length}편`
                  : `${families.length}개 열차 종류 · 총 ${services.length}편`}
              </p>
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
              {!family && services.length > 0 && (
                <p className="service-step-hint">
                  열차 종류를 고른 뒤 원하는 방면을 선택하세요.
                </p>
              )}
              {!family
                ? families.map((group) => (
                    <button
                      className="service-family-card"
                      key={group.id}
                      data-service-family={group.id}
                      aria-label={`${group.label} 경로 보기`}
                      onClick={() => {
                        push(
                          {
                            ...capture(),
                            depth: 1,
                            familyId: group.id,
                            routeId: null,
                            selectedId: null,
                            page: 0,
                            scopeOpen: false,
                          },
                          { kind: 'family', id: group.id },
                        )
                      }}
                    >
                      <span className="service-family-symbol">
                        <Icon name="train" size={23} />
                      </span>
                      <span>
                        <strong>{group.label}</strong>
                        <small>
                          {group.routes.length}개 방면 · {group.services.length}
                          편
                        </small>
                      </span>
                      <Icon name="chevron" size={18} />
                    </button>
                  ))
                : visibleRoutes.map((group) => (
                    <button
                      className="service-card service-route-card"
                      key={group.id}
                      data-service-route={group.id}
                      onClick={() => {
                        push(
                          {
                            ...capture(),
                            depth: 2,
                            routeId: group.id,
                            selectedId: group.services[0].id,
                            scopeOpen: false,
                          },
                          { kind: 'route', id: group.id },
                        )
                        onInspect()
                      }}
                    >
                      <strong>
                        {stationLabel(group.origin.name)}
                        <Icon name="arrow" size={16} />
                        {stationLabel(group.destination.name)}
                      </strong>
                      <span className="service-card-times">
                        {group.services.length}편 · 정차 패턴{' '}
                        {group.patternCount}가지
                      </span>
                      <span className="service-card-action">
                        시간대·전체 경로 보기 <Icon name="arrow" size={14} />
                      </span>
                    </button>
                  ))}
              {family && count > 1 && (
                <nav
                  className="service-pagination"
                  aria-label="운행 방면 페이지"
                >
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
            </>
          )}
        </div>
      )}
    </section>
  )
}
