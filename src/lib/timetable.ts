import type { Journey, JourneyLeg, TrainStop, TrainTrip } from '../types.ts'
const koreaFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function parseKoreaTime(value: string | null): number | null {
  if (!value) return null
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T]((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/.exec(
      value,
    )
  if (!match) return null
  const calendar = new Date(match[1] + 'T00:00:00Z')
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== match[1]
  )
    return null
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3] ?? '00'}+09:00`)
  return Number.isFinite(time) ? time : null
}

export function formatKoreaTime(
  time: number | null,
  referenceDate?: string,
): string {
  if (time === null) return '시각 미제공'
  const label = koreaFormatter.format(time)
  if (!referenceDate) return label
  const midnight = startingTime(referenceDate, '00:00')
  const days = midnight === null ? 0 : Math.floor((time - midnight) / 86400000)
  return days > 0 ? `${label}(+${days}일)` : label
}

interface IndexedTrip {
  trip: TrainTrip
  arrivals: (number | null)[]
  departures: (number | null)[]
}
interface Boarding {
  service: IndexedTrip
  position: number
  departure: number
}
export interface TimetableIndex {
  departures: Map<string, Boarding[]>
  stationNames: Map<string, string>
  tripCount: number
}

export function createTimetableIndex(trips: TrainTrip[]): TimetableIndex {
  const departures = new Map<string, Boarding[]>(),
    stationNames = new Map<string, string>()
  for (const trip of trips) {
    const service: IndexedTrip = {
      trip,
      arrivals: trip.stops.map((stop) => parseKoreaTime(stop.arrival)),
      departures: trip.stops.map((stop) => parseKoreaTime(stop.departure)),
    }
    for (let position = 0; position < trip.stops.length; position++) {
      const stop = trip.stops[position]
      stationNames.set(stop.stationId, stop.name)
      const departure = service.departures[position]
      if (departure === null || position === trip.stops.length - 1) continue
      if (
        service.arrivals[position] !== null &&
        departure < service.arrivals[position]!
      )
        continue
      if (!departures.has(stop.stationId)) departures.set(stop.stationId, [])
      departures.get(stop.stationId)!.push({ service, position, departure })
    }
  }
  for (const entries of departures.values())
    entries.sort(
      (a, b) =>
        a.departure - b.departure ||
        a.service.trip.id.localeCompare(b.service.trip.id),
    )
  return { departures, stationNames, tripCount: trips.length }
}

interface LegRef {
  service: IndexedTrip
  from: number
  to: number
  departureAt: number
  arrivalAt: number
}
interface Label {
  arrival: number
  legs: LegRef[]
}
interface Options {
  date: string
  earliestTime?: string
  minTransferMinutes?: number
  maxTransfers?: number
  limit?: number
}

function startingTime(date: string, time: string): number | null {
  if (!/^\d{8}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return null
  return parseKoreaTime(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time}:00`,
  )
}

function lowerBound(entries: Boarding[], earliest: number) {
  let low = 0,
    high = entries.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (entries[mid].departure < earliest) low = mid + 1
    else high = mid
  }
  return low
}

function visitStops(boarding: Boarding, visit: (leg: LegRef) => void) {
  const { service, position, departure } = boarding
  let last = departure
  for (let to = position + 1; to < service.trip.stops.length; to++) {
    const arrival = service.arrivals[to],
      nextDeparture = service.departures[to]
    if (arrival !== null) {
      if (arrival < last) break
      visit({
        service,
        from: position,
        to,
        departureAt: departure,
        arrivalAt: arrival,
      })
      last = arrival
    }
    if (nextDeparture !== null) {
      if (nextDeparture < last) break
      last = nextDeparture
    }
  }
}

function journey(refs: LegRef[]): Journey {
  const legs: JourneyLeg[] = refs.map((leg) => ({
    tripId: leg.service.trip.id,
    trainNumber: leg.service.trip.trainNumber,
    trainType: leg.service.trip.trainType,
    stops: leg.service.trip.stops.slice(leg.from, leg.to + 1),
    departureAt: leg.departureAt,
    arrivalAt: leg.arrivalAt,
  }))
  return {
    id: refs
      .map((leg) => `${leg.service.trip.id}:${leg.from}-${leg.to}`)
      .join('|'),
    legs,
    departureAt: legs[0].departureAt,
    arrivalAt: legs.at(-1)!.arrivalAt,
  }
}

export function findJourneys(
  index: TimetableIndex,
  start: string,
  end: string,
  options: Options,
): Journey[] {
  if (start === end) return []
  const notBefore = startingTime(options.date, options.earliestTime ?? '00:00'),
    midnight = startingTime(options.date, '00:00')
  if (notBefore === null || midnight === null) return []
  const limit = Math.max(1, Math.min(options.limit ?? 12, 50))
  const firstDayEnd = midnight + 86400000
  const starts = index.departures.get(start) ?? []
  const direct: LegRef[][] = []
  for (
    let i = lowerBound(starts, notBefore);
    i < starts.length && starts[i].departure < firstDayEnd;
    i++
  ) {
    visitStops(starts[i], (leg) => {
      if (leg.service.trip.stops[leg.to].stationId === end) direct.push([leg])
    })
  }
  if (direct.length)
    return direct
      .map(journey)
      .sort(
        (a, b) =>
          a.departureAt - b.departureAt ||
          a.arrivalAt - b.arrivalAt ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit)

  const transferMinutes = options.minTransferMinutes ?? 10
  if (!Number.isFinite(transferMinutes) || transferMinutes < 0) return []
  const transferMs = Math.min(transferMinutes, 240) * 60000
  const maxLegs = Math.max(1, Math.min((options.maxTransfers ?? 2) + 1, 3))
  let labels = new Map<string, Label>([
    [start, { arrival: notBefore, legs: [] }],
  ])
  for (let depth = 1; depth <= maxLegs; depth++) {
    const next = new Map<string, Label>(),
      found: LegRef[][] = []
    for (const [stationId, label] of labels) {
      const entries = index.departures.get(stationId) ?? []
      const earliest = label.arrival + (depth === 1 ? 0 : transferMs)
      for (let i = lowerBound(entries, earliest); i < entries.length; i++) {
        const boarding = entries[i]
        if (depth === 1 && boarding.departure >= firstDayEnd) break
        if (boarding.departure > midnight + 2 * 86400000) break
        if (
          label.legs.some(
            (leg) => leg.service.trip.id === boarding.service.trip.id,
          )
        )
          continue
        visitStops(boarding, (leg) => {
          const id = leg.service.trip.stops[leg.to].stationId
          const refs = [...label.legs, leg]
          if (id === end) found.push(refs)
          const previous = next.get(id)
          if (!previous || leg.arrivalAt < previous.arrival)
            next.set(id, { arrival: leg.arrivalAt, legs: refs })
        })
      }
    }
    if (found.length) {
      return [
        ...new Map(
          found.map((refs) => {
            const result = journey(refs)
            return [result.id, result]
          }),
        ).values(),
      ]
        .sort(
          (a, b) =>
            a.arrivalAt - b.arrivalAt ||
            b.departureAt - a.departureAt ||
            a.id.localeCompare(b.id),
        )
        .slice(0, limit)
    }
    labels = next
    if (!labels.size) break
  }
  return []
}

export function journeyStops(result: Journey): TrainStop[] {
  const stops: TrainStop[] = []
  for (const leg of result.legs) {
    if (stops.length) {
      stops[stops.length - 1] = {
        ...stops.at(-1)!,
        departure: leg.stops[0].departure,
      }
      stops.push(...leg.stops.slice(1))
    } else stops.push(...leg.stops)
  }
  return stops
}
