import test from 'node:test'
import assert from 'node:assert/strict'
import type { TrainTrip } from '../src/types.ts'
import {
  createTimetableIndex,
  findJourneys,
  journeyStops,
  parseKoreaTime,
  formatKoreaTime,
} from '../src/lib/timetable.ts'
import { loadTimetable } from '../src/lib/load-timetable.ts'

const date = '20261026'
function trip(
  number: string,
  stops: [string, string][],
  trainType: string | null = null,
): TrainTrip {
  return {
    id: `${date}:${number}`,
    date,
    trainNumber: number,
    trainType,
    stops: stops.map(([id, time], index) => ({
      stationId: id,
      name: id,
      sequence: index + 1,
      arrival: index ? `2026-10-26 ${time}:00.0` : null,
      departure: index < stops.length - 1 ? `2026-10-26 ${time}:00.0` : null,
    })),
  }
}

test('direct services preserve each train number and its own complete stop list including Osong', () => {
  const records = [
    trip(
      '00002',
      [
        ['동대구', '08:00'],
        ['대전', '09:00'],
        ['오송', '09:20'],
        ['서울', '10:10'],
      ],
      'KTX',
    ),
    trip(
      '00004',
      [
        ['동대구', '08:30'],
        ['대전', '09:30'],
        ['서울', '10:30'],
      ],
      'KTX',
    ),
  ]
  const options = findJourneys(
    createTimetableIndex(records),
    '동대구',
    '서울',
    { date },
  )
  assert.equal(options.length, 2)
  assert.deepEqual(
    options[0].legs[0].stops.map((stop) => stop.name),
    ['동대구', '대전', '오송', '서울'],
  )
  assert.deepEqual(
    options[1].legs[0].stops.map((stop) => stop.name),
    ['동대구', '대전', '서울'],
  )
  assert.equal(options[0].legs[0].trainNumber, '00002')
  assert.equal(options[0].legs[0].trainType, 'KTX')
})

test('a real direct train takes priority over a shorter graph path or an earlier transfer', () => {
  const records = [
    trip(
      '801',
      [
        ['서울', '08:00'],
        ['만종', '09:00'],
        ['좌표없는역', '09:20'],
        ['강릉', '10:00'],
      ],
      'KTX-이음',
    ),
    trip('transfer-1', [
      ['서울', '07:00'],
      ['x', '07:30'],
    ]),
    trip('transfer-2', [
      ['x', '07:45'],
      ['강릉', '09:00'],
    ]),
  ]
  const [option] = findJourneys(createTimetableIndex(records), '서울', '강릉', {
    date,
  })
  assert.equal(option.legs.length, 1)
  assert.equal(option.legs[0].trainNumber, '801')
  assert.deepEqual(
    journeyStops(option).map((stop) => stop.name),
    ['서울', '만종', '좌표없는역', '강릉'],
  )
})

test('train direction and the user departure time are enforced', () => {
  const index = createTimetableIndex([
    trip('1', [
      ['a', '08:00'],
      ['b', '09:00'],
    ]),
  ])
  assert.deepEqual(findJourneys(index, 'b', 'a', { date }), [])
  assert.deepEqual(
    findJourneys(index, 'a', 'b', { date, earliestTime: '08:01' }),
    [],
  )
  assert.equal(
    findJourneys(index, 'a', 'b', { date, earliestTime: '08:00' }).length,
    1,
  )
  assert.deepEqual(findJourneys(index, 'a', 'a', { date }), [])
})

test('transfers require enough time and keep both actual services and all stops', () => {
  const index = createTimetableIndex([
    trip('first', [
      ['a', '08:00'],
      ['x', '09:00'],
    ]),
    trip('missed', [
      ['x', '08:59'],
      ['b', '09:30'],
    ]),
    trip('too-tight', [
      ['x', '09:05'],
      ['b', '09:45'],
    ]),
    trip('valid', [
      ['x', '09:15'],
      ['mid', '09:45'],
      ['b', '10:15'],
    ]),
  ])
  const [result] = findJourneys(index, 'a', 'b', {
    date,
    minTransferMinutes: 10,
  })
  assert.deepEqual(
    result.legs.map((leg) => leg.trainNumber),
    ['first', 'valid'],
  )
  assert.equal(
    result.legs[1].departureAt - result.legs[0].arrivalAt,
    15 * 60000,
  )
  assert.deepEqual(
    journeyStops(result).map((stop) => stop.name),
    ['a', 'x', 'mid', 'b'],
  )
  assert.match(journeyStops(result)[1].departure!, /09:15/)
  assert.deepEqual(
    findJourneys(index, 'a', 'b', { date, minTransferMinutes: 20 }),
    [],
  )
  assert.deepEqual(findJourneys(index, 'a', 'b', { date, maxTransfers: 0 }), [])
})

test('up to two chronological transfers can be found without inventing reverse or missed connections', () => {
  const index = createTimetableIndex([
    trip('one', [
      ['a', '08:00'],
      ['x', '09:00'],
    ]),
    trip('two', [
      ['x', '09:20'],
      ['y', '10:00'],
    ]),
    trip('three', [
      ['y', '10:20'],
      ['b', '11:00'],
    ]),
  ])
  assert.deepEqual(findJourneys(index, 'a', 'b', { date, maxTransfers: 1 }), [])
  assert.equal(
    findJourneys(index, 'a', 'b', { date, maxTransfers: 2 })[0].legs.length,
    3,
  )
})

test('overnight transfers use explicit Korean dates rather than clock-only comparisons', () => {
  const one = trip('night-1', [
    ['a', '23:40'],
    ['x', '23:59'],
  ])
  one.stops[1].arrival = '2026-10-27 00:15:00.0'
  const two = trip('night-2', [
    ['z', '23:00'],
    ['x', '23:30'],
    ['b', '23:50'],
  ])
  two.stops[1].arrival = '2026-10-27 00:29:00.0'
  two.stops[1].departure = '2026-10-27 00:30:00.0'
  two.stops[2].arrival = '2026-10-27 01:20:00.0'
  const [option] = findJourneys(createTimetableIndex([one, two]), 'a', 'b', {
    date,
    earliestTime: '23:00',
  })
  assert.equal(option.legs.length, 2)
  assert.match(formatKoreaTime(option.arrivalAt, date), /01:20\(\+1일\)/)
})

test('bad calendar dates and backwards train times are not turned into valid journeys', () => {
  assert.equal(parseKoreaTime('2026-02-30 08:00:00'), null)
  assert.equal(
    new Date(parseKoreaTime('2026-10-26 08:00:00.0')!).toISOString(),
    '2026-10-25T23:00:00.000Z',
  )
  const bad = trip('bad', [
    ['a', '10:00'],
    ['x', '09:00'],
    ['b', '11:00'],
  ])
  assert.deepEqual(
    findJourneys(createTimetableIndex([bad]), 'a', 'b', { date }),
    [],
  )
})

test('static timetable downloads are reused for repeated searches', async () => {
  let requests = 0
  const payload = {
    metadata: { dataDate: date },
    trips: [
      trip('cache', [
        ['a', '08:00'],
        ['b', '09:00'],
      ]),
    ],
  }
  const fetcher = async () => {
    requests++
    return new Response(JSON.stringify(payload))
  }
  const one = await loadTimetable('/fixture/cache.json', date, fetcher)
  const two = await loadTimetable('/fixture/cache.json', date, fetcher)
  assert.equal(one, two)
  assert.equal(requests, 1)
  assert.equal(findJourneys(two, 'a', 'b', { date }).length, 1)
})

test('wrong data dates and invalid stop sequences fail instead of falling back to graph routes', async () => {
  await assert.rejects(
    loadTimetable(
      '/fixture/wrong-date.json',
      date,
      async () =>
        new Response(
          JSON.stringify({ metadata: { dataDate: '20261025' }, trips: [] }),
        ),
    ),
    /날짜나 형식/,
  )
  const bad = trip('bad-sequence', [
    ['a', '08:00'],
    ['b', '09:00'],
  ])
  bad.stops[1].sequence = 1
  await assert.rejects(
    loadTimetable(
      '/fixture/bad-sequence.json',
      date,
      async () =>
        new Response(
          JSON.stringify({ metadata: { dataDate: date }, trips: [bad] }),
        ),
    ),
    /정차 순서/,
  )
})

test('circular services keep both distinct-station sections and repeated intermediate stops', () => {
  const record = trip('circle', [
    ['홍성', '08:00'],
    ['합덕', '08:30'],
    ['안중', '09:00'],
    ['합덕', '09:30'],
    ['홍성', '10:00'],
  ])
  const index = createTimetableIndex([record])
  const outbound = findJourneys(index, '홍성', '안중', { date })
  const inbound = findJourneys(index, '안중', '홍성', { date })
  assert.deepEqual(outbound[0].legs[0].stops, record.stops.slice(0, 3))
  assert.deepEqual(inbound[0].legs[0].stops, record.stops.slice(2))
  assert.deepEqual(findJourneys(index, '홍성', '홍성', { date }), [])
})
