import type { Station, TrainTrip } from '../types.ts'
import type { TimetableIndex } from './timetable.ts'
import { matchesTrainFilter } from './train-filter.ts'
import type { TrainFilter } from './train-filter.ts'
import { stationLabel } from './station-labels.ts'
import { trainTypeKey } from './train-filter.ts'
import { parseKoreaTime } from './timetable.ts'

const serviceFamilies = [
  { id: 'ktx', label: 'KTX' },
  { id: 'srt', label: 'SRT' },
  { id: 'itx', label: 'ITX' },
  { id: 'mugunghwa', label: '무궁화' },
  { id: 'saemaeul', label: '새마을' },
  { id: 'nuriro', label: '누리로' },
  { id: 'commuter', label: '통근열차' },
  { id: 'unknown', label: '기타·미확인' },
] as const

export interface ServiceRouteGroup {
  id: string
  origin: TrainTrip['stops'][number]
  destination: TrainTrip['stops'][number]
  services: TrainTrip[]
  patternCount: number
}

export interface ServiceFamilyGroup {
  id: string
  label: string
  services: TrainTrip[]
  routes: ServiceRouteGroup[]
}

// Vehicle families do not identify an operator. Never classify SRT from a
// station prefix or train number when the supplied type is a KTX vehicle.
export function serviceFamily(type: string | null | undefined): string {
  const name = type ? trainTypeKey(type) : ''
  if (/^KTX(?:$|[-(])/.test(name)) return 'ktx'
  if (/^SRT(?:$|[-(])/.test(name)) return 'srt'
  if (/^ITX(?:$|[-(])/.test(name)) return 'itx'
  if (/^무궁화(?:호)?$/.test(name)) return 'mugunghwa'
  if (/^새마을(?:호)?$/.test(name)) return 'saemaeul'
  if (/^누리로(?:호)?$/.test(name)) return 'nuriro'
  if (/^통근(?:열차)?$/.test(name)) return 'commuter'
  return 'unknown'
}

export function groupExplorerServices(
  trips: TrainTrip[],
): ServiceFamilyGroup[] {
  return serviceFamilies.flatMap((family) => {
    const services = trips.filter(
      (trip) =>
        trip.stops.length > 1 && serviceFamily(trip.trainType) === family.id,
    )
    if (!services.length) return []
    const byRoute = new Map<string, ServiceRouteGroup>()
    for (const trip of services) {
      const origin = trip.stops[0],
        destination = trip.stops.at(-1)!
      const id = JSON.stringify([origin.stationId, destination.stationId])
      if (!byRoute.has(id))
        byRoute.set(id, {
          id,
          origin,
          destination,
          services: [],
          patternCount: 0,
        })
      byRoute.get(id)!.services.push(trip)
    }
    const routes = [...byRoute.values()]
      .map((route) => ({
        ...route,
        services: [...route.services].sort(
          (a, b) =>
            (parseKoreaTime(a.stops[0].departure) ?? Infinity) -
              (parseKoreaTime(b.stops[0].departure) ?? Infinity) ||
            a.trainNumber.localeCompare(b.trainNumber, 'ko', {
              numeric: true,
            }) ||
            a.id.localeCompare(b.id),
        ),
        // Retain every original stopping pattern and service. A route group is
        // only a menu, never a combined itinerary drawn as an actual train.
        patternCount: new Set(
          route.services.map((trip) =>
            JSON.stringify(trip.stops.map((stop) => stop.stationId)),
          ),
        ).size,
      }))
      .sort(
        (a, b) =>
          stationLabel(a.origin.name).localeCompare(
            stationLabel(b.origin.name),
            'ko',
          ) ||
          stationLabel(a.destination.name).localeCompare(
            stationLabel(b.destination.name),
            'ko',
          ) ||
          a.id.localeCompare(b.id),
      )
    return [{ ...family, services, routes }]
  })
}

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
