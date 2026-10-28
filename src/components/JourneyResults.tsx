import { trainTypeLabel } from '../lib/train-labels.ts'
import { stationLabel } from '../lib/station-labels.ts'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ConnectionSegment, Journey } from '../types.ts'
import { stationById } from '../data/railway.ts'
import {
  formatKoreaTime,
  journeyStops,
  parseKoreaTime,
} from '../lib/timetable.ts'
import { Icon } from './Icon.tsx'
import { BookingLinks } from './BookingLinks.tsx'

interface Props {
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  onRetry: () => void
  requested: boolean
  options: Journey[]
  selectedIndex: number
  onChoose: (index: number) => void
  segments: ConnectionSegment[]
  date: string
  filterLabel?: string
  onExpand: () => void
}

export function JourneyResults({
  loadState,
  error,
  onRetry,
  requested,
  options,
  selectedIndex,
  onChoose,
  segments,
  date,
  filterLabel,
  onExpand,
}: Props) {
  const selected = options[selectedIndex] ?? options[0]
  const stops = useMemo(
    () => (selected ? journeyStops(selected) : []),
    [selected],
  )
  if (loadState === 'loading')
    return (
      <div className="route-intro" role="status">
        운행 기록을 불러오고 있습니다.
      </div>
    )
  if (loadState === 'error')
    return (
      <div className="empty-state" role="alert">
        <Icon name="info" size={28} />
        <h3>운행 자료를 확인할 수 없어요</h3>
        <p>{error}</p>
        <button onClick={onRetry}>다시 불러오기</button>
      </div>
    )
  if (!requested)
    return (
      <div className="route-intro">
        <span className="route-intro-icon">
          <Icon name="train" size={32} />
        </span>
        <h2>실제 열차편으로 경로 찾기</h2>
        <p>
          자료 날짜와 출발 시각을 확인해 주세요.
          <br />
          운행 방향과 환승 시간을 확인해 실제 열차편을 연결합니다.
        </p>
      </div>
    )
  if (!selected)
    return (
      <div className="empty-state">
        <Icon name="route" size={32} />
        <h3>확인 가능한 열차편이 없어요</h3>
        <p>
          이 자료 날짜·출발 시각·환승·열차 종류 조건에서 확인한 결과입니다. 실제
          운행이 없다는 뜻은 아니므로 최신 시간표도 확인해 주세요.
        </p>
        {filterLabel && <p>열차 종류: {filterLabel}</p>}
      </div>
    )
  const transfers = selected.legs.length - 1
  const duration = Math.round(
    (selected.arrivalAt - selected.departureAt) / 60000,
  )
  return (
    <>
      <div className="connection-heading">
        <span className="eyebrow">운행 기록으로 확인한 경로</span>
        <h2>
          {stationLabel(stops[0].name)}
          <Icon name="arrow" size={20} />
          {stationLabel(stops.at(-1)!.name)}
        </h2>
        <div className="journey-summary">
          <strong>{transfers ? `환승 ${transfers}회` : '직통'}</strong>
          <span>
            {formatKoreaTime(selected.departureAt, date)} →{' '}
            {formatKoreaTime(selected.arrivalAt, date)}
          </span>
        </div>
        <p>
          {Math.floor(duration / 60)}시간 {duration % 60}분 · 선택한 열차편의
          구간 정차역 {stops.length}개
        </p>
        <p>열차편에 따라 오송 등 중간 정차역이 달라질 수 있습니다.</p>
        {filterLabel && <p>열차 종류: {filterLabel}</p>}
        <button className="edit-journey-button" onClick={onExpand}>
          열차·출발 시각·정렬 변경
        </button>
      </div>
      <label className="journey-picker">
        이용 열차 선택
        <select
          aria-label="이용 열차 선택"
          value={selectedIndex}
          onChange={(event) => onChoose(Number(event.target.value))}
        >
          {options.map((option, index) => (
            <option key={option.id} value={index}>
              {formatKoreaTime(option.departureAt, date)} →{' '}
              {formatKoreaTime(option.arrivalAt, date)} ·{' '}
              {option.legs
                .map(
                  (leg) =>
                    `${trainTypeLabel(leg) ?? '열차'} ${leg.trainNumber}호`,
                )
                .join(' / ')}{' '}
              ·{' '}
              {option.legs.length === 1
                ? '직통'
                : `환승 ${option.legs.length - 1}회`}
            </option>
          ))}
        </select>
      </label>
      <BookingLinks journey={selected} />
      <ol className="connection-stops">
        {stops.map((stop, index) => {
          const segment =
            segments.find(
              (segment) =>
                index >= segment.startIndex && index < segment.endIndex,
            ) ?? segments.at(-1)
          const begins = segment?.startIndex === index
          const transfer = index > 0 && begins
          return (
            <li
              key={`${index}:${stop.stationId}`}
              className={transfer ? 'route-change-stop' : ''}
              style={{ '--route-color': segment?.color } as CSSProperties}
            >
              <span
                className={`stop-dot ${index === 0 || index === stops.length - 1 ? 'endpoint' : ''}`}
              />
              <div>
                <strong>{stationLabel(stop.name)}역</strong>
                {!stationById.has(stop.stationId) && (
                  <small className="unmapped-stop">
                    지도 위치 정보 없음 · 정차역은 포함
                  </small>
                )}
                {begins && (
                  <small className="route-train-label">{segment.label}</small>
                )}
                <small className="stop-times">
                  {stop.arrival && index > 0 && (
                    <span>
                      도착 {formatKoreaTime(parseKoreaTime(stop.arrival), date)}
                    </span>
                  )}
                  {stop.departure && index < stops.length - 1 && (
                    <span>
                      출발{' '}
                      {formatKoreaTime(parseKoreaTime(stop.departure), date)}
                    </span>
                  )}
                </small>
              </div>
              <span
                className={
                  transfer ? 'stop-label route-change-label' : 'stop-label'
                }
              >
                {index === 0
                  ? '출발'
                  : index === stops.length - 1
                    ? '도착'
                    : transfer
                      ? `환승 · ${segment.transferMinutes}분`
                      : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </>
  )
}
