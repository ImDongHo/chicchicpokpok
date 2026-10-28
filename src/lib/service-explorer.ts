import type { Station, TrainTrip } from '../types.ts'
import type { TimetableIndex } from './timetable.ts'
import { matchesTrainFilter } from './train-filter.ts'
import type { TrainFilter } from './train-filter.ts'
import { stationLabel } from './station-labels.ts'

export type ServiceScope =
  | { mode: 'station'; stationId: string }
  | { mode: 'region'; region: string }
  | { mode: 'all' }

export interface ServiceExplorerOptions {
  scope: ServiceScope
  query?: string
  trainFilter?: TrainFilter
}

const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s\-()]/g, '')
    .replace(/역$/, '')

export function explorerStations(
  index: TimetableIndex | null,
  mapped: Station[],
): { id: string; name: string }[] {
  const names = new Map(mapped.map(({ id, name }) => [id, name]))
  for (const service of index?.services.values() ?? [])
    for (const stop of service.trip.stops) names.set(stop.stationId, stop.name)
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .sort(
      (a, b) =>
        stationLabel(a.name).localeCompare(stationLabel(b.name), 'ko') ||
        a.id.localeCompare(b.id),
    )
}

export function scopedMapStations(
  stations: Station[],
  scope: ServiceScope,
): Station[] {
  return stations.filter(
    (station) =>
      scope.mode === 'all' ||
      (scope.mode === 'station'
        ? station.id === scope.stationId
        : station.region === scope.region),
  )
}

export function findExplorerServices(
  index: TimetableIndex,
  mapped: Station[],
  options: ServiceExplorerOptions,
): TrainTrip[] {
  const { scope } = options
  const regionIds =
    scope.mode === 'region'
      ? new Set(
          mapped
            .filter((station) => station.region === scope.region)
            .map((station) => station.id),
        )
      : null
  const query = normalize(options.query ?? '')
  return [...index.services.values()]
    .filter(({ trip }) => {
      if (!matchesTrainFilter(trip.trainType, options.trainFilter)) return false
      if (
        scope.mode === 'station' &&
        !trip.stops.some((stop) => stop.stationId === scope.stationId)
      )
        return false
      if (
        scope.mode === 'region' &&
        !trip.stops.some((stop) => regionIds!.has(stop.stationId))
      )
        return false
      if (!query) return true
      return [
        trip.trainNumber,
        trip.trainType ?? '',
        ...trip.stops.map((stop) => stationLabel(stop.name)),
      ].some((text) => normalize(text).includes(query))
    })
    .sort(
      (a, b) =>
        a.departures[0]! - b.departures[0]! ||
        a.trip.trainNumber.localeCompare(b.trip.trainNumber, 'ko', {
          numeric: true,
        }) ||
        a.trip.id.localeCompare(b.trip.id),
    )
    .map(({ trip }) => trip)
}
