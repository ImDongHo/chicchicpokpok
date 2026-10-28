import type {
  Journey,
  JourneyLeg,
  TrainStop,
  TrainTrip,
  JourneyPreference,
} from '../types.ts'
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
  excludedTripCount: number
}

export function createTimetableIndex(trips: TrainTrip[]): TimetableIndex {
  const departures = new Map<string, Boarding[]>(),
    stationNames = new Map<string, string>()
  let tripCount = 0
  for (const trip of trips) {
    const service: IndexedTrip = {
      trip,
      arrivals: trip.stops.map((stop) => parseKoreaTime(stop.arrival)),
      departures: trip.stops.map((stop) => parseKoreaTime(stop.departure)),
    }
    let previousTime = -Infinity
    let verified =
      service.departures[0] !== null && service.arrivals.at(-1) !== null
    for (let i = 0; i < trip.stops.length; i++) {
      const stop = trip.stops[i]
      stationNames.set(stop.stationId, stop.name)
      for (const [source, time] of [
        [stop.arrival, service.arrivals[i]],
        [stop.departure, service.departures[i]],
      ] as const) {
        if (source !== null && time === null) verified = false
        if (time !== null) {
          if (time < previousTime) verified = false
          previousTime = time
        }
      }
    }
    if (!verified) continue
    tripCount++
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
  return {
    departures,
    stationNames,
    tripCount,
    excludedTripCount: trips.length - tripCount,
  }
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
  departure: number
}
export interface JourneySearchOptions {
  date: string
  earliestTime?: string
  minTransferMinutes?: number
  maxTransfers?: number
  limit?: number
  preference?: JourneyPreference
  maxDurationMinutes?: number
  latestArrivalTime?: string
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

function compareJourneys(
  a: Journey,
  b: Journey,
  preference: JourneyPreference,
) {
  const transfers = a.legs.length - b.legs.length
  return (
    (preference === 'fewest-transfers' ? transfers : 0) ||
    a.arrivalAt - b.arrivalAt ||
    transfers ||
    b.departureAt - a.departureAt ||
    a.id.localeCompare(b.id)
  )
}

function addLabel(target: Map<string, Label[]>, id: string, label: Label) {
  const previous = target.get(id) ?? []
  // Retain earlier arrivals and later departures as a Pareto frontier. A later
  // origin departure can meet a duration limit even when an earlier one cannot.
  if (
    previous.some(
      (value) =>
        value.arrival <= label.arrival && value.departure >= label.departure,
    )
  )
    return
  target.set(id, [
    ...previous.filter(
      (value) =>
        !(label.arrival <= value.arrival && label.departure >= value.departure),
    ),
    label,
  ])
}

function searchJourneys(
  index: TimetableIndex,
  start: string,
  options: JourneySearchOptions,
  target?: string,
): Map<string, LegRef[][]> {
  const result = new Map<string, LegRef[][]>()
  const notBefore = startingTime(options.date, options.earliestTime ?? '00:00'),
    midnight = startingTime(options.date, '00:00')
  if (notBefore === null || midnight === null) return result
  const transferMinutes = options.minTransferMinutes ?? 10
  const maxDuration = options.maxDurationMinutes ?? Infinity
  if (
    !Number.isFinite(transferMinutes) ||
    transferMinutes < 0 ||
    !(maxDuration > 0)
  )
    return result
  const transferMs = Math.min(transferMinutes, 240) * 60000
  const maxLegs = Math.max(1, Math.min((options.maxTransfers ?? 2) + 1, 3))
  const lastArrival = options.latestArrivalTime
    ? startingTime(options.date, options.latestArrivalTime)
    : midnight + 2 * 86400000
  if (lastArrival === null || lastArrival < notBefore) return result
  const preference = options.preference ?? 'fewest-transfers'
  let labels = new Map<string, Label[]>([
    [start, [{ arrival: notBefore, departure: notBefore, legs: [] }]],
  ])
  for (let depth = 1; depth <= maxLegs; depth++) {
    const next = new Map<string, Label[]>()
    for (const [stationId, values] of labels) {
      const entries = index.departures.get(stationId) ?? []
      for (const label of values) {
        const earliest = label.arrival + (depth === 1 ? 0 : transferMs)
        for (let i = lowerBound(entries, earliest); i < entries.length; i++) {
          const boarding = entries[i]
          if (depth === 1 && boarding.departure >= midnight + 86400000) break
          if (boarding.departure > lastArrival) break
          if (
            label.legs.some(
              (leg) => leg.service.trip.id === boarding.service.trip.id,
            )
          )
            continue
          visitStops(boarding, (leg) => {
            const id = leg.service.trip.stops[leg.to].stationId
            if (id === start || leg.arrivalAt > lastArrival) return
            const departure = depth === 1 ? leg.departureAt : label.departure
            if (leg.arrivalAt - departure > maxDuration * 60000) return
            const refs = [...label.legs, leg]
            if (depth === 1) {
              // Keep every direct service selectable, including slower stopping
              // variants whose complete stop lists differ from express trains.
              if (!result.has(id)) result.set(id, [])
              result.get(id)!.push(refs)
            }
            addLabel(next, id, {
              arrival: leg.arrivalAt,
              departure,
              legs: refs,
            })
          })
        }
      }
    }
    if (depth > 1)
      for (const [id, values] of next) {
        if (!result.has(id)) result.set(id, [])
        result.get(id)!.push(...values.map((value) => value.legs))
      }
    if (
      target &&
      preference === 'fewest-transfers' &&
      result.get(target)?.length
    )
      break
    labels = next
    if (!labels.size) break
  }
  return result
}

export function findJourneys(
  index: TimetableIndex,
  start: string,
  end: string,
  options: JourneySearchOptions,
): Journey[] {
  if (start === end) return []
  const preference = options.preference ?? 'fewest-transfers'
  const refs = searchJourneys(index, start, options, end).get(end) ?? []
  return [
    ...new Map(
      refs.map((value) => {
        const item = journey(value)
        return [item.id, item]
      }),
    ).values(),
  ]
    .sort((a, b) => compareJourneys(a, b, preference))
    .slice(0, Math.max(1, Math.min(options.limit ?? 12, 50)))
}

// A single traversal supplies destination discovery; it does not run a separate
// full search for every station on the map.
export function findReachableJourneys(
  index: TimetableIndex,
  start: string,
  options: JourneySearchOptions,
): Map<string, Journey> {
  const result = new Map<string, Journey>()
  const preference = options.preference ?? 'fastest'
  for (const [id, refs] of searchJourneys(index, start, {
    ...options,
    preference,
  })) {
    let best: Journey | undefined
    for (const ref of refs) {
      const candidate = journey(ref)
      if (!best || compareJourneys(candidate, best, preference) < 0)
        best = candidate
    }
    if (best) result.set(id, best)
  }
  return result
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
