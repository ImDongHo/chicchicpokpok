import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConnectionSegments,
  buildJourneySegments,
  mappedPaths,
} from '../src/lib/route-segments.ts'
import { createTimetableIndex, findJourneys } from '../src/lib/timetable.ts'
import type { RailLine } from '../src/types.ts'

const line = (
  id: string,
  stations: string[],
  trainNumbers = ['00001'],
): RailLine => ({
  id,
  name: '같은 노선',
  color: '#000',
  stations,
  trainNumbers,
})

test('a continuous train path keeps one segment even when other services share its track', () => {
  const segments = buildConnectionSegments(
    [
      line('short', ['a', 'b'], ['00002']),
      line('through', ['a', 'b', 'c', 'd']),
    ],
    ['a', 'b', 'c', 'd'],
  )
  assert.equal(segments.length, 1)
  assert.equal(segments[0].lineId, 'through')
  assert.deepEqual(segments[0].stationIds, ['a', 'b', 'c', 'd'])
  assert.equal(segments[0].directionConfirmed, true)
})

test('different train paths on the same named line use different colors and share their boundary station', () => {
  const segments = buildConnectionSegments(
    [
      line('first', ['a', 'b'], ['00001']),
      line('second', ['b', 'c'], ['00002']),
    ],
    ['a', 'b', 'c'],
  )
  assert.equal(segments.length, 2)
  assert.notEqual(segments[0].color, segments[1].color)
  assert.equal(segments[0].endIndex, segments[1].startIndex)
  assert.equal(segments[0].stationIds.at(-1), segments[1].stationIds[0])
  assert.match(segments[0].label, /열차 후보 00001/)
  assert.match(segments[1].label, /열차 후보 00002/)
})

test('all connection edges remain covered once across multiple route segments', () => {
  const path = ['a', 'b', 'c', 'd', 'e']
  const segments = buildConnectionSegments(
    [
      line('one', ['a', 'b', 'c']),
      line('two', ['b', 'c', 'd', 'e'], ['00003']),
    ],
    path,
  )
  assert.equal(segments.length, 2)
  assert.deepEqual(
    [
      segments[0].stationIds[0],
      ...segments.flatMap((segment) => segment.stationIds.slice(1)),
    ],
    path,
  )
})

test('a reversed graph connection is visibly marked as direction unconfirmed', () => {
  const [segment] = buildConnectionSegments(
    [line('one', ['a', 'b', 'c'])],
    ['c', 'b', 'a'],
  )
  assert.equal(segment.directionConfirmed, false)
  assert.match(segment.label, /방향 미확인/)
  assert.deepEqual(segment.stationIds, ['c', 'b', 'a'])
})

test('unknown and sample-only data never acquire an invented train number', () => {
  const unknown = buildConnectionSegments([], ['a', 'b', 'c'])
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].lineId, null)
  assert.deepEqual(unknown[0].trainNumbers, [])
  assert.match(unknown[0].label, /운행 정보 미확인/)
  const sample = buildConnectionSegments(
    [line('sample', ['a', 'b'], [])],
    ['a', 'b'],
  )
  assert.match(sample[0].label, /노선 기준/)
  assert.equal(sample[0].directionConfirmed, false)
})

test('repeated station names do not let one service skip intervening stops', () => {
  const segments = buildConnectionSegments(
    [line('loop', ['a', 'b', 'x', 'b', 'd'])],
    ['a', 'b', 'd'],
  )
  assert.equal(segments.length, 2)
  assert.deepEqual(segments[0].stationIds, ['a', 'b'])
  assert.deepEqual(segments[1].stationIds, ['b', 'd'])
})

test('empty or single-station connections draw no route segments', () => {
  assert.deepEqual(buildConnectionSegments([], null), [])
  assert.deepEqual(buildConnectionSegments([], []), [])
  assert.deepEqual(buildConnectionSegments([], ['a']), [])
})

test('unknown coordinates split only map geometry and never bridge missing stops', () => {
  assert.deepEqual(
    mappedPaths(['a', 'b', 'unknown', 'c', 'd'], new Set(['a', 'b', 'c', 'd'])),
    [
      ['a', 'b'],
      ['c', 'd'],
    ],
  )
  assert.deepEqual(mappedPaths(['a', 'unknown', 'b'], new Set(['a', 'b'])), [])
})

test('verified service legs retain train numbers and distinct colors with the actual transfer wait', () => {
  const trips = [
    {
      id: 'one',
      date: '20261026',
      trainNumber: '001',
      trainType: 'KTX',
      stops: [
        {
          stationId: 'a',
          name: 'a',
          sequence: 1,
          arrival: null,
          departure: '2026-10-26 08:00:00',
        },
        {
          stationId: 'x',
          name: 'x',
          sequence: 2,
          arrival: '2026-10-26 09:00:00',
          departure: null,
        },
      ],
    },
    {
      id: 'two',
      date: '20261026',
      trainNumber: '002',
      trainType: null,
      stops: [
        {
          stationId: 'x',
          name: 'x',
          sequence: 1,
          arrival: null,
          departure: '2026-10-26 09:20:00',
        },
        {
          stationId: 'b',
          name: 'b',
          sequence: 2,
          arrival: '2026-10-26 10:00:00',
          departure: null,
        },
      ],
    },
  ]
  const [journey] = findJourneys(createTimetableIndex(trips), 'a', 'b', {
    date: '20261026',
  })
  const segments = buildJourneySegments(journey, '20261026')
  assert.equal(segments[0].endIndex, segments[1].startIndex)
  assert.notEqual(segments[0].color, segments[1].color)
  assert.equal(segments[1].transferMinutes, 20)
  assert.match(segments[0].label, /KTX 001호/)
  assert.match(segments[1].label, /002호.*차종 미제공/)
})
