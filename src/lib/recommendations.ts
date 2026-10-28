import type { Journey, Station } from '../types.ts'
import {
  findJourneys,
  findReachableJourneys,
  parseKoreaTime,
} from './timetable.ts'
import type { JourneySearchOptions, TimetableIndex } from './timetable.ts'

export interface DiscoveryOptions {
  date: string
  earliestTime: string
  maxDurationMinutes: number
  maxTransfers: number
  minTransferMinutes: number
  requireReturn: boolean
  minStayMinutes?: number
  homeBy?: string
  limit?: number
}
export interface DestinationRecommendation {
  city: string
  area: string
  station: Station
  outbound: Journey
  returning: Journey | null
  searchOptions: JourneySearchOptions
  returnOptions: JourneySearchOptions | null
}

export function stationCity(station: Station): {
  key: string
  name: string
  area: string
} {
  const [province = '', municipality = ''] = station.area.trim().split(/\s+/)
  const metro = [
    '서울',
    '부산',
    '대구',
    '인천',
    '광주',
    '대전',
    '울산',
    '세종',
  ].find((name) => province.startsWith(name))
  const name =
    metro && !municipality.endsWith('군')
      ? metro
      : municipality.replace(/[시군]$/, '') || station.name
  return {
    key: `${station.region}:${name}`,
    name,
    area: [province, municipality].filter(Boolean).join(' '),
  }
}

export function recommendDestinations(
  index: TimetableIndex,
  stations: Station[],
  from: string,
  options: DiscoveryOptions,
): DestinationRecommendation[] {
  const byId = new Map(stations.map((station) => [station.id, station]))
  const origin = byId.get(from)
  if (!origin) return []
  const homeBy = options.homeBy ?? '23:00'
  const searchOptions: JourneySearchOptions = {
    date: options.date,
    earliestTime: options.earliestTime,
    preference: 'fastest',
    maxDurationMinutes: options.maxDurationMinutes,
    maxTransfers: options.maxTransfers,
    minTransferMinutes: options.minTransferMinutes,
    ...(options.requireReturn ? { latestArrivalTime: homeBy } : {}),
  }
  const originCity = stationCity(origin).key
  const candidates = [...findReachableJourneys(index, from, searchOptions)]
    .flatMap(([id, outbound]) => {
      const station = byId.get(id)
      if (!station || stationCity(station).key === originCity) return []
      return [{ station, outbound, city: stationCity(station) }]
    })
    .sort(
      (a, b) =>
        a.outbound.arrivalAt - b.outbound.arrivalAt ||
        a.outbound.arrivalAt -
          a.outbound.departureAt -
          (b.outbound.arrivalAt - b.outbound.departureAt) ||
        a.city.key.localeCompare(b.city.key),
    )
  const midnight = parseKoreaTime(
    `${options.date.slice(0, 4)}-${options.date.slice(4, 6)}-${options.date.slice(6, 8)} 00:00:00`,
  )
  if (midnight === null) return []
  const result: DestinationRecommendation[] = [],
    seen = new Set<string>()
  const limit = Math.max(1, Math.min(options.limit ?? 8, 12))
  for (const candidate of candidates) {
    if (seen.has(candidate.city.key)) continue
    let returning: Journey | null = null,
      returnOptions: JourneySearchOptions | null = null
    if (options.requireReturn) {
      const minutes = Math.ceil(
        (candidate.outbound.arrivalAt +
          (options.minStayMinutes ?? 120) * 60000 -
          midnight) /
          60000,
      )
      if (minutes < 0 || minutes >= 1440) continue
      returnOptions = {
        ...searchOptions,
        earliestTime: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        latestArrivalTime: homeBy,
      }
      returning =
        findJourneys(index, candidate.station.id, from, {
          ...returnOptions,
          limit: 1,
        })[0] ?? null
      if (!returning) continue
    }
    result.push({
      city: candidate.city.name,
      area: candidate.city.area,
      station: candidate.station,
      outbound: candidate.outbound,
      returning,
      searchOptions,
      returnOptions,
    })
    seen.add(candidate.city.key)
    if (result.length === limit) break
  }
  return result
}
