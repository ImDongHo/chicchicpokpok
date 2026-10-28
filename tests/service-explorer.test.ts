import test from 'node:test'
import assert from 'node:assert/strict'
import type { Station, TrainTrip } from '../src/types.ts'
import {
  createTimetableIndex,
  findJourneys,
  formatKoreaTime,
  fullServiceJourney,
} from '../src/lib/timetable.ts'
import {
  explorerStations,
  findExplorerServices,
  scopedMapStations,
} from '../src/lib/service-explorer.ts'
import { buildJourneySegments } from '../src/lib/route-segments.ts'
import { DEFAULT_TRAIN_FILTER } from '../src/lib/train-filter.ts'

const date = '20261027'
const mapped: Station[] = [
  {
    id: 'busan',
    name: '부산',
    region: '영남',
    area: '부산 동구',
    lat: 35.11,
    lng: 129.04,
    description: '',
  },
  {
    id: 'dongdaegu',
    name: '동대구',
    region: '영남',
    area: '대구 동구',
    lat: 35.88,
    lng: 128.63,
    description: '',
  },
  {
    id: 'daejeon',
    name: '대전',
    region: '충청',
    area: '대전 동구',
    lat: 36.33,
    lng: 127.43,
    description: '',
  },
  {
    id: 'seoul',
    name: '서울',
    region: '서울',
    area: '서울 중구',
    lat: 37.55,
    lng: 126.97,
    description: '',
  },
  {
    id: 'no-records',
    name: '기록없는역',
    region: '강원',
    area: '',
    lat: 37.5,
    lng: 128.2,
    description: '',
  },
]
function trip(
  id: string,
  type: string | null,
  stops: [string, string, string][],
): TrainTrip {
  return {
    id,
    date,
    trainNumber: id,
    trainType: type,
    stops: stops.map(([stationId, name, time], position) => ({
      stationId,
      name,
      sequence: position + 1,
      arrival: position === 0 ? null : `2026-10-27 ${time}:00`,
      departure: position === stops.length - 1 ? null : `2026-10-27 ${time}:00`,
    })),
  }
}
const north = trip('00104', 'KTX', [
  ['busan', '부산', '08:00'],
  ['dongdaegu', '동대구', '09:00'],
  ['unmapped', '위치미확인', '09:30'],
  ['daejeon', '대전', '10:00'],
  ['seoul', '서울', '11:00'],
])
const south = trip('01234', '무궁화호', [
  ['seoul', '서울', '12:00'],
  ['daejeon', '대전', '13:00'],
  ['dongdaegu', '동대구', '14:00'],
  ['busan', '부산', '15:00'],
])
const records = [north, south]

test('station exploration finds complete services at origin, intermediate, terminal and unmapped stops', () => {
  const index = createTimetableIndex(records)
  for (const stationId of ['busan', 'dongdaegu', 'daejeon', 'seoul'])
    assert.deepEqual(
      findExplorerServices(index, mapped, {
        scope: { mode: 'station', stationId },
      }).map((service) => service.id),
      ['00104', '01234'],
    )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'station', stationId: 'unmapped' },
    }),
    [north],
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'station', stationId: 'no-records' },
    }),
    [],
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'station', stationId: 'absent' },
    }),
    [],
  )
})

test('region matching uses verified mapped stops once per train and includes services starting outside the region', () => {
  const index = createTimetableIndex(records)
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'region', region: '영남' },
    }),
    records,
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'region', region: '서울' },
    }),
    records,
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'region', region: '강원' },
    }),
    [],
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, { scope: { mode: 'all' } }),
    records,
  )
})

test('service search and category filters apply to the full candidate list without inferring stops', () => {
  const alias = trip('00302', 'KTX-산천(A-type)', [
    ['dongdaegu', '동대구', '16:00'],
    ['suseo', 'S수서', '18:00'],
  ])
  const index = createTimetableIndex([...records, alias])
  for (const query of ['302', '수서역', '산천'])
    assert.deepEqual(
      findExplorerServices(index, mapped, { scope: { mode: 'all' }, query }),
      [alias],
    )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'all' },
      query: '무궁화 호',
      trainFilter: {
        category: 'conventional',
        types: null,
        includeUnknown: false,
      },
    }),
    [south],
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'station', stationId: 'dongdaegu' },
      query: '오송',
    }),
    [],
  )
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'all' },
      trainFilter: {
        ...DEFAULT_TRAIN_FILTER,
        types: ['KTX-산천(A-TYPE)'],
        includeUnknown: false,
      },
    }),
    [alias],
  )
})

test('complete service preserves both sides of the selected station and all unmapped stop records', () => {
  const snapshot = structuredClone(records),
    index = createTimetableIndex(records)
  const [section] = findJourneys(index, 'dongdaegu', 'seoul', { date })
  assert.equal(section.legs[0].stops[0].stationId, 'dongdaegu')
  const whole = fullServiceJourney(index, section.legs[0].tripId)!
  assert.equal(whole.legs.length, 1)
  assert.deepEqual(whole.legs[0].stops, north.stops)
  assert.equal(formatKoreaTime(whole.departureAt, date), '08:00')
  assert.equal(formatKoreaTime(whole.arrivalAt, date), '11:00')
  assert.deepEqual(
    buildJourneySegments(whole, date)[0].stationIds,
    north.stops.map((stop) => stop.stationId),
  )
  assert.deepEqual(records, snapshot)
  assert.equal(fullServiceJourney(index, 'missing'), null)
})

test('invalid timed services are excluded from both full-service browsing and its station catalogue', () => {
  const invalid = trip('invalid', 'KTX', [
    ['invalid-only', '검증실패전용역', '20:00'],
    ['busan', '부산', '19:00'],
  ])
  const index = createTimetableIndex([...records, invalid])
  assert.equal(index.excludedTripCount, 1)
  assert.deepEqual(
    findExplorerServices(index, mapped, { scope: { mode: 'all' } }),
    records,
  )
  assert.equal(fullServiceJourney(index, 'invalid'), null)
  assert.equal(
    explorerStations(index, mapped).some(
      (station) => station.id === 'invalid-only',
    ),
    false,
  )
})

test('full-service records keep repeated station visits in their original time order', () => {
  const loop = trip('loop', '무궁화호', [
    ['busan', '부산', '08:00'],
    ['dongdaegu', '동대구', '09:00'],
    ['busan', '부산', '10:00'],
  ])
  const index = createTimetableIndex([loop])
  assert.deepEqual(
    findExplorerServices(index, mapped, {
      scope: { mode: 'station', stationId: 'busan' },
    }),
    [loop],
  )
  assert.deepEqual(fullServiceJourney(index, 'loop')!.legs[0].stops, loop.stops)
})

test('full-service display preserves operator uncertainty and next-day terminal times', () => {
  const overnight = trip('00302', 'KTX-산천(A-type)', [
    ['busan', '부산', '23:00'],
    ['suseo', 'S수서', '23:59'],
  ])
  overnight.stops[1].arrival = '2026-10-28 00:30:00'
  const whole = fullServiceJourney(
    createTimetableIndex([overnight]),
    overnight.id,
  )!
  assert.equal(whole.legs[0].operatorUnconfirmed, true)
  assert.equal(whole.legs[0].trainType, overnight.trainType)
  assert.equal(formatKoreaTime(whole.arrivalAt, date), '00:30(+1일)')
  assert.equal(whole.legs[0].stops[1].name, 'S수서')
})

test('map scope stays bounded by the selected scope without mutating the station dataset', () => {
  const snapshot = structuredClone(mapped)
  assert.deepEqual(
    scopedMapStations(mapped, { mode: 'station', stationId: 'dongdaegu' }).map(
      (station) => station.id,
    ),
    ['dongdaegu'],
  )
  assert.deepEqual(
    scopedMapStations(mapped, { mode: 'station', stationId: 'unmapped' }),
    [],
  )
  assert.equal(
    scopedMapStations(mapped, { mode: 'region', region: '영남' }).length,
    2,
  )
  assert.deepEqual(scopedMapStations(mapped, { mode: 'all' }), mapped)
  assert.deepEqual(mapped, snapshot)
})

test('station options retain terminal-only and unmapped station IDs and original names', () => {
  const terminal = trip('srt', 'SRT', [
    ['busan', '부산', '18:00'],
    ['suseo', 'S수서', '20:00'],
  ])
  const index = createTimetableIndex([...records, terminal])
  const options = explorerStations(index, mapped)
  assert.deepEqual(
    options.find((station) => station.id === 'suseo'),
    { id: 'suseo', name: 'S수서' },
  )
  assert.ok(options.some((station) => station.id === 'unmapped'))
  assert.ok(options.some((station) => station.id === 'no-records'))
  assert.equal(options.filter((station) => station.id === 'busan').length, 1)
  assert.equal(
    findExplorerServices(index, mapped, {
      scope: { mode: 'station', stationId: 'suseo' },
    })[0],
    terminal,
  )
})
