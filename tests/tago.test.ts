import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTagoClient,
  collectTago,
  matchService,
  parseServices,
  serviceQuery,
  stationLookup,
  tagoTime,
} from '../scripts/tago.mjs'

const trip = {
  id: '20261028:00801',
  date: '20261028',
  trainNumber: '00801',
  trainType: null,
  stops: [
    {
      stationId: 'seoul',
      name: '서울',
      sequence: 1,
      arrival: null,
      departure: '2026-10-28 05:06:00.0',
    },
    {
      stationId: 'unknown',
      name: '평창',
      sequence: 2,
      arrival: '2026-10-28 06:30:00.0',
      departure: '2026-10-28 06:32:00.0',
    },
    {
      stationId: 'gangneung',
      name: '강릉',
      sequence: 3,
      arrival: '2026-10-28 07:04:00.0',
      departure: null,
    },
  ],
}
const stations = [
  { nodeid: 'NAT010000', nodename: '서울' },
  { nodeid: 'NAT601936', nodename: '강릉' },
]
const query = serviceQuery(trip, stationLookup(stations))!
const row = {
  trainno: 801,
  traingradename: 'KTX-이음',
  depplacename: '서울',
  arrplacename: '강릉',
  depplandtime: 20261028050600,
  arrplandtime: 20261028070400,
}
const envelope = (rows: unknown, total = 1, pageNo = 1) => ({
  response: {
    header: { resultCode: '00' },
    body: { items: { item: rows }, totalCount: total, pageNo },
  },
})

test('TAGO collection joins official vehicle names without replacing the original complete stops', async () => {
  const calls: URL[] = []
  const fetcher = async (url: URL) => {
    calls.push(new URL(url))
    const method = url.pathname.split('/').at(-1)
    assert.ok(url.pathname.startsWith('/1613000/TrainInfo/'))
    if (method === 'GetVhcleKndList')
      return new Response(
        JSON.stringify(
          envelope([{ vehiclekndid: '16', vehiclekndnm: 'KTX-이음' }]),
        ),
      )
    if (method === 'GetCtyCodeList')
      return new Response(
        JSON.stringify(envelope([{ citycode: 11, cityname: '테스트' }])),
      )
    if (method === 'GetCtyAcctoTrainSttnList')
      return new Response(JSON.stringify(envelope(stations, 2)))
    assert.equal(method, 'GetStrtpntAlocFndTrainInfo')
    assert.equal(url.searchParams.get('depPlandTime'), trip.date)
    assert.equal(url.searchParams.get('depPlaceId'), query.from)
    return new Response(JSON.stringify(envelope([row])))
  }
  const result = await collectTago(
    [trip],
    trip.date,
    'fixture-not-a-real-key',
    fetcher,
  )
  assert.equal(result.coverage.matched, 1)
  assert.equal(result.coverage.requests, 4)
  assert.equal(result.trips[0].trainType, 'KTX-이음')
  assert.deepEqual(result.trips[0].stops, trip.stops)
  assert.equal(result.trips[0].timetableVerified.date, trip.date)
  assert.equal(calls.length, 4)
})

test('TAGO vehicle name joins only the same dated service, stations and exact endpoint times', () => {
  const rows = parseServices([row], query, trip.date)
  assert.equal(matchService(trip, query, rows)?.trainType, 'KTX-이음')
  assert.equal(
    matchService({ ...trip, trainNumber: '00803' }, query, rows),
    null,
  )
  const tomorrow = parseServices(
    [{ ...row, depplandtime: 20261029050600, arrplandtime: 20261029070400 }],
    query,
    '20261029',
  )
  assert.equal(
    matchService(trip, query, tomorrow),
    null,
    'Do not apply tomorrow’s train kind to a historical record',
  )
  assert.equal(
    matchService(trip, query, [
      { ...rows[0], departure: '2026-10-28 05:07:00' },
    ]),
    null,
  )
  assert.equal(
    matchService(trip, query, [{ ...rows[0], from: 'different-station' }]),
    null,
  )
  assert.equal(
    matchService(trip, query, [
      ...rows,
      { ...rows[0], trainType: 'conflicting-kind' },
    ]),
    null,
  )
  assert.equal(
    trip.stops.length,
    3,
    'Classification must not replace or truncate the full stop list',
  )
})

test('station aliases stay unambiguous and duplicate place names are never guessed', () => {
  const lookup = stationLookup([
    ...stations,
    { nodeid: 'old', nodename: '신경주' },
    { nodeid: 'new', nodename: '경주' },
    { nodeid: 'jinbu', nodename: '진부(오대산)' },
    { nodeid: 'suseo', nodename: '수서' },
  ])
  assert.equal(lookup.get('경주'), null)
  assert.equal(lookup.get('진부'), 'jinbu')
  assert.equal(
    serviceQuery(
      { ...trip, stops: [{ ...trip.stops[0], name: '경주' }, trip.stops[2]] },
      lookup,
    ),
    null,
  )
  assert.equal(
    serviceQuery(
      { ...trip, stops: [{ ...trip.stops[0], name: 'S수서' }, trip.stops[2]] },
      lookup,
    )?.from,
    'suseo',
  )
})

test('circular records can be classified using a distinct intermediate endpoint without dropping their return stops', () => {
  const circular = {
    ...trip,
    stops: [
      ...trip.stops,
      {
        ...trip.stops[0],
        sequence: 4,
        arrival: '2026-10-28 10:00:00',
        departure: null,
      },
    ],
  }
  const lookup = stationLookup(stations)
  assert.equal(serviceQuery(circular, lookup)?.last.name, '강릉')
  assert.equal(circular.stops.at(-1)?.name, '서울')
})

test('TAGO dates, stations and timetable direction must agree with the request', () => {
  assert.deepEqual(parseServices([row], query, '20261027'), [])
  assert.deepEqual(
    parseServices([{ ...row, arrplacename: '부산' }], query, trip.date),
    [],
  )
  assert.deepEqual(
    parseServices([{ ...row, arrplandtime: 20261028040000 }], query, trip.date),
    [],
  )
  const rejected = { reasons: {}, examples: [] }
  const verified = parseServices(
    [{ ...row, arrplandtime: 20261028040000 }, row],
    query,
    trip.date,
    rejected,
  )
  assert.equal(verified.length, 1)
  assert.equal(matchService(trip, query, verified)?.trainType, 'KTX-이음')
  assert.equal(rejected.reasons['arrival-before-departure'], 1)
  assert.throws(() => tagoTime(20260230080000), /invalid/)
  assert.throws(() => tagoTime(20261028240000), /invalid/)
  assert.equal(tagoTime(20261029001000), '2026-10-29 00:10:00')
})

test('TAGO pagination sends the exact date, tolerates an empty result and rejects repeated pages', async () => {
  const calls: URL[] = []
  const fetcher = async (url: URL) => {
    calls.push(new URL(url))
    return new Response(JSON.stringify(envelope([row], 2, calls.length)))
  }
  const client = createTagoClient('test-key-not-real', fetcher)
  await assert.rejects(
    client.list(
      'GetStrtpntAlocFndTrainInfo',
      { depPlandTime: trip.date },
      true,
    ),
    /repeated/,
  )
  assert.equal(calls[0].searchParams.get('depPlandTime'), trip.date)
  assert.equal(calls[0].searchParams.get('_type'), 'json')
  assert.equal(calls[1].searchParams.get('pageNo'), '2')
  const empty = createTagoClient(
    'test',
    async () => new Response(JSON.stringify(envelope([], 0))),
  )
  assert.deepEqual(await empty.list('GetStrtpntAlocFndTrainInfo', {}, true), [])
})

test('TAGO error handling never prints authenticated URLs, keys or upstream exception messages', async () => {
  const key = 'credential-sentinel-not-real'
  const client = createTagoClient(key, async (url: URL) => {
    throw new Error(String(url))
  })
  await assert.rejects(
    client.list('GetCtyCodeList'),
    (error: Error) =>
      !error.message.includes(key) && !error.message.includes('https://'),
  )
  const denied = createTagoClient(
    key,
    async () => new Response(key, { status: 403 }),
  )
  await assert.rejects(denied.list('GetVhcleKndList'), /HTTP 403/)
  const upstream = createTagoClient(
    key,
    async () =>
      new Response(
        JSON.stringify({
          response: { header: { resultCode: '30', resultMsg: key } },
        }),
      ),
  )
  await assert.rejects(
    upstream.list('GetCtyCodeList'),
    (error: Error) => !error.message.includes(key),
  )
})
