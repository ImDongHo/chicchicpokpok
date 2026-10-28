import { createHash } from 'node:crypto'
import { parseKoreaTime } from '../src/lib/timetable.ts'

const service = 'https://apis.data.go.kr/1613000/TrainInfo/'
const methods = new Set([
  'GetVhcleKndList',
  'GetCtyCodeList',
  'GetCtyAcctoTrainSttnList',
  'GetStrtpntAlocFndTrainInfo',
])

export class TagoError extends Error {}

// Do not propagate upstream exception messages: they can contain authenticated URLs.
export function createTagoClient(key, fetcher = fetch) {
  let requests = 0
  return {
    get requests() {
      return requests
    },
    async list(method, parameters = {}, paginated = false) {
      if (!methods.has(method)) throw new TagoError('Unknown TAGO operation.')
      const result = [],
        seen = new Set()
      let total
      for (let page = 1; page <= 100; page++) {
        const url = new URL(method, service)
        url.searchParams.set('serviceKey', key)
        url.searchParams.set('_type', 'json')
        if (paginated) {
          url.searchParams.set('pageNo', String(page))
          url.searchParams.set('numOfRows', '1000')
        }
        for (const [name, value] of Object.entries(parameters))
          url.searchParams.set(name, String(value))
        if (++requests > 1000)
          throw new TagoError('TAGO collection request budget exceeded.')
        let response
        try {
          response = await fetcher(url, {
            signal: AbortSignal.timeout(20000),
            redirect: 'error',
          })
        } catch {
          throw new TagoError(
            `TAGO ${method} connection failed; credentials omitted.`,
          )
        }
        if (!response.ok)
          throw new TagoError(
            `TAGO ${method} HTTP ${response.status}; check the official service URL and approval.`,
          )
        let payload
        try {
          payload = await response.json()
        } catch {
          throw new TagoError(
            `TAGO ${method} did not return the requested JSON format.`,
          )
        }
        if (
          !['0', '00', '0000'].includes(
            String(payload?.response?.header?.resultCode),
          )
        )
          throw new TagoError(
            `TAGO ${method} returned an application error; check approval and quota.`,
          )
        const body = payload.response.body
        let rows = body?.items?.item ?? []
        if (!Array.isArray(rows) && rows && typeof rows === 'object')
          rows = [rows]
        if (!Array.isArray(rows))
          throw new TagoError(
            `TAGO ${method} returned an unsupported item schema.`,
          )
        if (!paginated) return rows
        if (!/^\d+$/.test(String(body.totalCount)))
          throw new TagoError(`TAGO ${method} omitted its pagination total.`)
        if (total === undefined) total = Number(body.totalCount)
        if (
          total !== Number(body.totalCount) ||
          (body.pageNo !== undefined && Number(body.pageNo) !== page)
        )
          throw new TagoError(`TAGO ${method} changed during pagination.`)
        if (total === 0 && rows.length === 0 && page === 1) return []
        const hash = createHash('sha256')
          .update(JSON.stringify(rows))
          .digest('hex')
        if (
          !rows.length ||
          seen.has(hash) ||
          result.length + rows.length > total
        )
          throw new TagoError(
            `TAGO ${method} returned an incomplete or repeated page.`,
          )
        seen.add(hash)
        result.push(...rows)
        if (result.length === total) return result
      }
      throw new TagoError(`TAGO ${method} pagination limit exceeded.`)
    },
  }
}

export function normalizeStationName(value) {
  const name = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s/g, '')
    .replace(/역$/, '')
  const aliases = {
    '진부(오대산)': '진부',
    '김천(구미)': '김천구미',
    '울산(통도사)': '울산',
    신경주: '경주',
    S수서: '수서',
    S동탄: '동탄',
    S평택지제: '평택지제',
  }
  return (aliases[name] ?? name).toLowerCase()
}

export function stationLookup(stations) {
  const byName = new Map()
  for (const station of stations) {
    if (
      typeof station.nodeid !== 'string' ||
      typeof station.nodename !== 'string'
    )
      throw new TagoError(
        'TAGO station identifiers do not match the documented schema.',
      )
    const name = normalizeStationName(station.nodename)
    const previous = byName.get(name)
    if (previous !== undefined && previous !== station.nodeid)
      byName.set(name, null)
    else byName.set(name, station.nodeid)
  }
  return byName
}

export function trainNumber(value) {
  const text = String(value ?? '')
  return /^\d{1,6}$/.test(text) ? text.replace(/^0+(?=\d)/, '') : null
}

export function tagoTime(value) {
  const text = String(value ?? '')
  if (!/^\d{14}$/.test(text))
    throw new TagoError('TAGO returned an unsupported timetable date.')
  const result = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`
  if (parseKoreaTime(result) === null)
    throw new TagoError('TAGO returned an invalid timetable date.')
  return result
}

export function serviceQuery(trip, lookup) {
  const first = trip.stops[0]
  // A circular service is looked up to its last distinct intermediate station.
  const last = trip.stops.findLast((stop) => stop.stationId !== first.stationId)
  if (!last) return null
  const from = lookup.get(normalizeStationName(first.name)),
    to = lookup.get(normalizeStationName(last.name))
  if (!from || !to || from === to) return null
  const planned =
    last === trip.stops.at(-1) && trip.plannedDeparture && trip.plannedArrival
  return {
    from,
    to,
    first,
    last,
    departure: planned ? trip.plannedDeparture : first.departure,
    arrival: planned ? trip.plannedArrival : last.arrival,
    timingBasis: planned ? 'planned' : 'recorded',
  }
}

export function parseServices(
  rows,
  query,
  date,
  rejected = { reasons: {}, examples: [] },
) {
  const exclude = (reason, number, departure, arrival) => {
    rejected.reasons[reason] = (rejected.reasons[reason] ?? 0) + 1
    if (rejected.examples.length < 8)
      rejected.examples.push({
        reason,
        trainNumber: number,
        departure,
        arrival,
      })
    return []
  }
  return rows.flatMap((row) => {
    const number = trainNumber(row.trainno)
    if (
      !number ||
      typeof row.traingradename !== 'string' ||
      !row.traingradename.trim()
    )
      throw new TagoError(
        'TAGO omitted the documented train number or vehicle name.',
      )
    let departure, arrival
    try {
      departure = tagoTime(row.depplandtime)
      arrival = tagoTime(row.arrplandtime)
    } catch {
      return exclude('invalid-time-format', number)
    }
    if (departure.slice(0, 10).replaceAll('-', '') !== date)
      return exclude('outside-request-date', number, departure, arrival)
    if (parseKoreaTime(arrival) < parseKoreaTime(departure))
      return exclude('arrival-before-departure', number, departure, arrival)
    if (
      normalizeStationName(row.depplacename) !==
        normalizeStationName(query.first.name) ||
      normalizeStationName(row.arrplacename) !==
        normalizeStationName(query.last.name)
    )
      return exclude('different-stations', number, departure, arrival)
    return {
      trainNumber: number,
      trainType: row.traingradename.trim(),
      departure,
      arrival,
      from: query.from,
      to: query.to,
      departureName: String(row.depplacename),
      arrivalName: String(row.arrplacename),
    }
  })
}

export function matchService(trip, query, services) {
  const matches = services.filter(
    (row) =>
      row.trainNumber === trainNumber(trip.trainNumber) &&
      row.from === query.from &&
      row.to === query.to &&
      parseKoreaTime(row.departure) === parseKoreaTime(query.departure) &&
      parseKoreaTime(row.arrival) === parseKoreaTime(query.arrival),
  )
  const types = new Set(matches.map((row) => row.trainType))
  if (types.size !== 1) return null
  return matches[0]
}

async function mapBatches(values, mapper) {
  const result = []
  for (let i = 0; i < values.length; i += 4) {
    const batch = await Promise.allSettled(values.slice(i, i + 4).map(mapper))
    for (const item of batch) {
      if (item.status === 'rejected') throw item.reason
      result.push(item.value)
    }
  }
  return result
}

export async function collectTago(trips, date, key, fetcher = fetch) {
  const client = createTagoClient(key, fetcher)
  const vehicleKinds = await client.list('GetVhcleKndList')
  const cities = await client.list('GetCtyCodeList')
  if (
    !cities.length ||
    !cities.every((city) => /^\d+$/.test(String(city.citycode)))
  )
    throw new TagoError('TAGO city codes do not match the documented schema.')
  const stations = (
    await mapBatches(cities, (city) =>
      client.list(
        'GetCtyAcctoTrainSttnList',
        { cityCode: city.citycode },
        true,
      ),
    )
  ).flat()
  const lookup = stationLookup(stations)
  const queries = new Map()
  for (const trip of trips) {
    const query = serviceQuery(trip, lookup)
    if (query) queries.set(`${query.from}:${query.to}`, query)
  }
  if (!queries.size)
    throw new TagoError(
      'No unambiguous official station pairs could be joined to the recorded services.',
    )
  const rejectedSchedules = { reasons: {}, examples: [] }
  const schedules = new Map(
    await mapBatches([...queries], async ([id, query]) => {
      const rows = await client.list(
        'GetStrtpntAlocFndTrainInfo',
        {
          depPlaceId: query.from,
          arrPlaceId: query.to,
          depPlandTime: date,
        },
        true,
      )
      return [id, parseServices(rows, query, date, rejectedSchedules)]
    }),
  )
  let matched = 0,
    unmatched = 0,
    unmapped = 0
  const joined = trips.map((trip) => {
    const query = serviceQuery(trip, lookup)
    if (!query) {
      unmapped++
      return trip
    }
    const service = matchService(
      trip,
      query,
      schedules.get(`${query.from}:${query.to}`) ?? [],
    )
    if (!service) {
      unmatched++
      return trip
    }
    matched++
    return {
      ...trip,
      trainType: service.trainType,
      timetableVerified: {
        source: 'TAGO',
        date,
        from: query.from,
        to: query.to,
        departure: service.departure,
        arrival: service.arrival,
        timingBasis: query.timingBasis,
      },
    }
  })
  return {
    trips: joined,
    coverage: {
      source: 'TAGO',
      date,
      requests: client.requests,
      stationCount: stations.length,
      stationPairs: queries.size,
      matched,
      unmatched,
      unmapped,
      vehicleKinds,
      rejectedSchedules,
    },
    services: [...schedules.values()].flat(),
  }
}
