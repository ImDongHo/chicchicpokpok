import type { TrainTrip } from '../types.ts'
import { createTimetableIndex } from './timetable.ts'
import type { TimetableIndex } from './timetable.ts'

let cachedKey = ''
let cachedPromise: Promise<TimetableIndex> | null = null

export function loadTimetable(
  url: string,
  expectedDate: string,
  fetcher: typeof fetch = fetch,
): Promise<TimetableIndex> {
  const key = `${url}:${expectedDate}`
  if (cachedPromise && cachedKey === key) return cachedPromise
  const request = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const response = await fetcher(url, {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
      })
      if (!response.ok)
        throw new Error(
          '운행 자료를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.',
        )
      if (Number(response.headers.get('content-length') ?? 0) > 8_000_000)
        throw new Error('운행 자료가 너무 커서 불러오기를 중단했습니다.')
      const text = await response.text()
      if (text.length > 8_000_000)
        throw new Error('운행 자료가 너무 커서 불러오기를 중단했습니다.')
      const payload = JSON.parse(text)
      if (
        payload?.metadata?.dataDate !== expectedDate ||
        !Array.isArray(payload.trips) ||
        !payload.trips.length ||
        payload.trips.length > 5000
      )
        throw new Error(
          '운행 자료의 날짜나 형식이 맞지 않습니다. 새로고침해 주세요.',
        )
      const trips: TrainTrip[] = payload.trips
      const ids = new Set<string>()
      for (const trip of trips) {
        if (
          typeof trip.id !== 'string' ||
          ids.has(trip.id) ||
          trip.date !== expectedDate ||
          typeof trip.trainNumber !== 'string' ||
          !Array.isArray(trip.stops) ||
          trip.stops.length < 2 ||
          trip.stops.length > 300
        )
          throw new Error('검증할 수 없는 열차 자료입니다.')
        ids.add(trip.id)
        let previousSequence = 0
        for (const stop of trip.stops) {
          if (
            typeof stop.stationId !== 'string' ||
            typeof stop.name !== 'string' ||
            !Number.isInteger(stop.sequence) ||
            stop.sequence <= previousSequence ||
            !(stop.arrival === null || typeof stop.arrival === 'string') ||
            !(stop.departure === null || typeof stop.departure === 'string')
          )
            throw new Error('정차 순서를 검증할 수 없는 운행 자료입니다.')
          previousSequence = stop.sequence
        }
        if (
          trip.trainType !== null &&
          trip.trainType !== undefined &&
          typeof trip.trainType !== 'string'
        )
          throw new Error('열차 종류 정보를 검증할 수 없습니다.')
      }
      const index = createTimetableIndex(trips)
      if (!index.departures.size)
        throw new Error('출발 시각을 확인할 수 있는 운행 자료가 없습니다.')
      return index
    } finally {
      clearTimeout(timer)
    }
  })()
  cachedKey = key
  cachedPromise = request
  request.catch(() => {
    if (cachedPromise === request) cachedPromise = null
  })
  return request
}
