import test from 'node:test'
import assert from 'node:assert/strict'
import type { Station, TrainTrip } from '../src/types.ts'
import {
  availableTrainTypes,
  DEFAULT_TRAIN_FILTER,
  matchesTrainFilter,
  trainCategory,
  trainFilterLabel,
} from '../src/lib/train-filter.ts'
import type { TrainFilter } from '../src/lib/train-filter.ts'
import { createTimetableIndex, findJourneys } from '../src/lib/timetable.ts'
import { recommendDestinations } from '../src/lib/recommendations.ts'

const date = '20261027'
const high: TrainFilter = {
  category: 'high-speed',
  types: null,
  includeUnknown: false,
}
const normal: TrainFilter = {
  category: 'conventional',
  types: null,
  includeUnknown: false,
}
function trip(
  id: string,
  type: string | null,
  stops: [string, string][],
): TrainTrip {
  return {
    id,
    date,
    trainNumber: id,
    trainType: type,
    stops: stops.map(([stationId, time], position) => ({
      stationId,
      name: stationId,
      sequence: position + 1,
      arrival: position === 0 ? null : `2026-10-27 ${time}:00`,
      departure: position === stops.length - 1 ? null : `2026-10-27 ${time}:00`,
    })),
  }
}
const places: Station[] = [
  ['a', '서울특별시 중구', '서울'],
  ['b', '강원특별자치도 강릉시', '강원'],
  ['c', '대전광역시 동구', '충청'],
].map(([id, area, region]) => ({
  id,
  name: id,
  area,
  region,
  lat: 37,
  lng: 128,
  description: '',
}))

test('classifies supplied vehicle names without guessing an operator or unrecognized category', () => {
  for (const name of [
    'KTX',
    'KTX-이음',
    'KTX-청룡',
    'KTX-산천(A-type)',
    ' SRT ',
    'ktx - 이음',
  ])
    assert.equal(trainCategory(name), 'high-speed')
  for (const name of [
    'ITX-새마을',
    'ITX-마음',
    'ITX-청춘',
    '무궁화호',
    '새마을호',
    '누리로',
    '통근열차',
  ])
    assert.equal(trainCategory(name), 'conventional')
  for (const name of [
    null,
    '',
    '차종 미제공',
    'S수서',
    '00302',
    'KTX임의명',
    '새로운차종',
  ])
    assert.equal(trainCategory(name), null)
  assert.deepEqual(
    availableTrainTypes(
      ['KTX', 'ktx', '무궁화호', 'KTX-이음', '임의명'],
      'high-speed',
    ).map((item) => item.key),
    ['KTX', 'KTX-이음'],
  )
})

test('default preserves all records, with explicit opt-in for unknowns under restricted categories', () => {
  for (const type of [null, undefined, '', 'KTX', 'ITX-새마을', '미분류']) {
    assert.equal(matchesTrainFilter(type), true)
    assert.equal(matchesTrainFilter(type, DEFAULT_TRAIN_FILTER), true)
  }
  assert.equal(matchesTrainFilter(null, high), false)
  assert.equal(
    matchesTrainFilter(null, { ...high, includeUnknown: true }),
    true,
  )
  assert.equal(
    matchesTrainFilter('무궁화호', { ...high, includeUnknown: true }),
    false,
  )
  assert.equal(matchesTrainFilter('KTX', { ...high, types: [] }), false)
  assert.equal(
    matchesTrainFilter('KTX', { ...high, types: ['KTX-이음'] }),
    false,
  )
  assert.equal(
    matchesTrainFilter('ktx - 이음', { ...high, types: ['KTX-이음'] }),
    true,
  )
  assert.match(
    trainFilterLabel({ ...high, types: ['KTX-이음'] }),
    /1종 선택.*미확인 제외/,
  )
})

test('filters while searching, so later eligible trains survive result limits', () => {
  const records = Array.from({ length: 15 }, (_, i) =>
    trip(`fast${i}`, 'KTX', [
      ['a', '08:00'],
      ['b', `09:${String(i).padStart(2, '0')}`],
    ]),
  )
  records.push(
    trip('slow', '무궁화호', [
      ['a', '08:00'],
      ['b', '11:00'],
    ]),
  )
  const index = createTimetableIndex(records)
  const snapshot = structuredClone(records)
  assert.equal(
    findJourneys(index, 'a', 'b', { date, limit: 1 })[0].legs[0].tripId,
    'fast0',
  )
  assert.equal(
    findJourneys(index, 'a', 'b', { date, limit: 1, trainFilter: normal })[0]
      .legs[0].tripId,
    'slow',
  )
  assert.deepEqual(
    findJourneys(index, 'a', 'b', { date }),
    findJourneys(index, 'a', 'b', { date, trainFilter: DEFAULT_TRAIN_FILTER }),
  )
  assert.deepEqual(records, snapshot)
})

test('checks every transfer and retains eligible alternatives before dominance pruning', () => {
  const index = createTimetableIndex([
    trip('early-normal', '무궁화호', [
      ['a', '08:00'],
      ['x', '08:30'],
    ]),
    trip('high-first', 'KTX', [
      ['a', '08:20'],
      ['x', '09:00'],
    ]),
    trip('normal-second', 'ITX-마음', [
      ['x', '09:10'],
      ['b', '09:40'],
    ]),
    trip('high-second', 'KTX-이음', [
      ['x', '09:15'],
      ['b', '10:00'],
    ]),
  ])
  const [eligible] = findJourneys(index, 'a', 'b', {
    date,
    trainFilter: high,
    preference: 'fastest',
  })
  assert.deepEqual(
    eligible.legs.map((leg) => leg.tripId),
    ['high-first', 'high-second'],
  )
  assert.equal(
    findJourneys(index, 'a', 'b', { date, trainFilter: normal })[0].legs.every(
      (leg) => matchesTrainFilter(leg.trainType, normal),
    ),
    true,
  )
  assert.deepEqual(
    findJourneys(index, 'a', 'b', {
      date,
      trainFilter: { ...high, types: ['KTX'] },
    }),
    [],
  )
})

test('a typed filter keeps unknown legs excluded unless explicitly included', () => {
  const index = createTimetableIndex([
    trip('first', 'KTX', [
      ['a', '08:00'],
      ['x', '09:00'],
    ]),
    trip('unknown', null, [
      ['x', '09:15'],
      ['b', '10:00'],
    ]),
  ])
  assert.deepEqual(
    findJourneys(index, 'a', 'b', { date, trainFilter: high }),
    [],
  )
  assert.equal(
    findJourneys(index, 'a', 'b', {
      date,
      trainFilter: { ...high, includeUnknown: true },
    }).length,
    1,
  )
})

test('SR-prefixed stops never turn the supplied KTX vehicle into an explicit SRT selection', () => {
  const index = createTimetableIndex([
    trip('00302', 'KTX-산천(A-type)', [
      ['a', '08:00'],
      ['S수서', '10:00'],
    ]),
  ])
  assert.deepEqual(
    findJourneys(index, 'a', 'S수서', {
      date,
      trainFilter: { ...high, types: ['SRT'] },
    }),
    [],
  )
  const [result] = findJourneys(index, 'a', 'S수서', {
    date,
    trainFilter: high,
  })
  assert.equal(result.legs[0].trainType, 'KTX-산천(A-type)')
  assert.equal(result.legs[0].operatorUnconfirmed, true)
})

test('recommendations apply the same exact type selection to outbound, return and selected-route options', () => {
  const index = createTimetableIndex([
    trip('fast-out', 'KTX', [
      ['a', '09:00'],
      ['b', '10:00'],
    ]),
    trip('selected-out', 'ITX-마음', [
      ['a', '09:05'],
      ['b', '11:00'],
    ]),
    trip('fast-home', 'KTX', [
      ['b', '13:00'],
      ['a', '14:00'],
    ]),
    trip('selected-home', 'ITX-마음', [
      ['b', '14:00'],
      ['a', '16:00'],
    ]),
    trip('no-return-out', 'ITX-마음', [
      ['a', '09:10'],
      ['c', '11:00'],
    ]),
    trip('wrong-return', 'KTX', [
      ['c', '14:00'],
      ['a', '15:00'],
    ]),
  ])
  const filter = { ...normal, types: ['ITX-마음'] }
  const options = {
    date,
    earliestTime: '09:00',
    maxDurationMinutes: 180,
    maxTransfers: 1,
    minTransferMinutes: 10,
    requireReturn: true,
    trainFilter: filter,
  }
  const [result, ...rest] = recommendDestinations(index, places, 'a', options)
  assert.deepEqual(rest, [])
  assert.equal(result.city, '강릉')
  assert.equal(result.outbound.legs[0].tripId, 'selected-out')
  assert.equal(result.returning!.legs[0].tripId, 'selected-home')
  assert.deepEqual(result.searchOptions.trainFilter, filter)
  assert.deepEqual(result.returnOptions!.trainFilter, filter)
  assert.equal(
    findJourneys(index, 'a', 'b', result.searchOptions)[0].id,
    result.outbound.id,
  )
  assert.equal(
    findJourneys(index, 'b', 'a', result.returnOptions!)[0].id,
    result.returning!.id,
  )
  assert.equal(
    recommendDestinations(index, places, 'a', {
      ...options,
      requireReturn: false,
    }).length,
    2,
  )
})

test('discovery worker preserves type filters through structured cloning', async () => {
  const index = createTimetableIndex([
    trip('allowed', '무궁화호', [
      ['a', '09:00'],
      ['b', '11:00'],
    ]),
    trip('disallowed', 'KTX', [
      ['a', '09:00'],
      ['c', '10:00'],
    ]),
  ])
  const messages: { results: { station: Station }[] }[] = []
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const scope = {
    onmessage: null as null | ((event: unknown) => void),
    postMessage: (message: (typeof messages)[number]) => messages.push(message),
  }
  try {
    Object.defineProperty(globalThis, 'self', {
      configurable: true,
      value: scope,
    })
    await import('../src/workers/discovery.ts')
    scope.onmessage!({
      data: structuredClone({
        id: 1,
        index,
        stations: places,
        from: 'a',
        options: {
          date,
          earliestTime: '09:00',
          maxDurationMinutes: 180,
          maxTransfers: 1,
          minTransferMinutes: 10,
          requireReturn: false,
          trainFilter: normal,
        },
      }),
    })
    assert.deepEqual(
      messages[0].results.map((result) => result.station.id),
      ['b'],
    )
  } finally {
    if (previous) Object.defineProperty(globalThis, 'self', previous)
    else Reflect.deleteProperty(globalThis, 'self')
  }
})
