import test from 'node:test'
import assert from 'node:assert/strict'
import type { Station, TrainTrip } from '../src/types.ts'
import {
  stationLabel,
  hasSrStationLabel,
  compareStationLabels,
} from '../src/lib/station-labels.ts'
import {
  hasUnconfirmedOperator,
  trainTypeLabel,
} from '../src/lib/train-labels.ts'
import { createTimetableIndex, findJourneys } from '../src/lib/timetable.ts'
import { buildJourneySegments } from '../src/lib/route-segments.ts'
import { bookingLinks } from '../src/lib/booking.ts'
import { searchStations } from '../src/lib/railway.ts'

const date = '20261027'
const source: TrainTrip = {
  id: 'record:00302',
  date,
  trainNumber: '00302',
  trainType: 'KTX-산천(A-type)',
  stops: [
    {
      stationId: 'dongdaegu',
      name: '동대구',
      sequence: 1,
      arrival: null,
      departure: '2026-10-27 05:55:00',
    },
    {
      stationId: 'daejeon',
      name: '대전',
      sequence: 2,
      arrival: '2026-10-27 06:40:00',
      departure: '2026-10-27 06:42:00',
    },
    {
      stationId: 'source:dongtan',
      name: 'S동탄',
      sequence: 3,
      arrival: '2026-10-27 07:20:00',
      departure: '2026-10-27 07:22:00',
    },
    {
      stationId: 'source:suseo',
      name: 'S수서',
      sequence: 4,
      arrival: '2026-10-27 07:49:00',
      departure: null,
    },
  ],
}

test('only reviewed station display aliases remove the source prefix', () => {
  assert.equal(stationLabel('S수서'), '수서')
  assert.equal(stationLabel('S동탄'), '동탄')
  assert.equal(stationLabel('S평택지제'), '평택지제')
  for (const name of ['서울', '수서', 'SS수서', 'SRT', 'S임의역'])
    assert.equal(stationLabel(name), name)
  assert.equal(hasSrStationLabel('S수서'), true)
  assert.equal(hasSrStationLabel('수서'), false)
})

test('station dropdown order uses visible Korean names for source-prefixed stations', () => {
  const source = [
    '평택',
    'S수서',
    '서울',
    '부산',
    'S평택지제',
    'S동탄',
    '동대구',
    '대전',
    '울산',
  ].map((name) => ({ id: `source:${name}`, name }))
  const original = structuredClone(source)
  const sorted = [...source].sort(compareStationLabels)
  assert.deepEqual(
    sorted.map((station) => stationLabel(station.name)),
    [
      '대전',
      '동대구',
      '동탄',
      '부산',
      '서울',
      '수서',
      '울산',
      '평택',
      '평택지제',
    ],
  )
  assert.equal(
    sorted.find((station) => stationLabel(station.name) === '동탄')!.id,
    'source:S동탄',
  )
  assert.equal(
    sorted.find((station) => stationLabel(station.name) === '수서')!.name,
    'S수서',
  )
  assert.deepEqual(source, original)
})

test('identical display names retain distinct source IDs in a deterministic order', () => {
  const source = [
    { id: 'b', name: 'S수서' },
    { id: 'a', name: '수서' },
  ]
  assert.deepEqual(
    [...source].sort(compareStationLabels).map((station) => station.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    [...source]
      .reverse()
      .sort(compareStationLabels)
      .map((station) => station.id),
    ['a', 'b'],
  )
})

test('station search retains source names and IDs while accepting public station names', () => {
  const place: Station = {
    id: 'source:suseo',
    name: 'S수서',
    area: '서울 강남구',
    region: '서울',
    lat: 37.48,
    lng: 127.1,
    description: '',
  }
  for (const query of ['수서', '수서역', 'S수서역'])
    assert.equal(searchStations([place], query)[0], place)
  assert.equal(place.name, 'S수서')
  assert.equal(place.id, 'source:suseo')
})

test('vehicle classification is preserved without choosing an operator for SR-labelled services', () => {
  const snapshot = structuredClone(source)
  const [journey] = findJourneys(
    createTimetableIndex([source]),
    'dongdaegu',
    'source:suseo',
    { date },
  )
  const leg = journey.legs[0]
  assert.equal(leg.trainType, 'KTX-산천(A-type)')
  assert.equal(hasUnconfirmedOperator(leg), true)
  assert.equal(trainTypeLabel(leg), '차량 KTX-산천(A-type)')
  assert.deepEqual(
    bookingLinks(journey).map((link) => link.id),
    ['korail', 'srt'],
  )
  assert.deepEqual(leg.stops, source.stops)
  assert.match(
    buildJourneySegments(journey, date)[0].label,
    /차량 KTX-산천\(A-type\) 00302호/,
  )
  assert.deepEqual(source, snapshot)
})

test('operator uncertainty follows the full service into a selected section with no prefixed stations', () => {
  const [journey] = findJourneys(
    createTimetableIndex([source]),
    'dongdaegu',
    'daejeon',
    { date },
  )
  assert.ok(
    journey.legs[0].stops.every((stop) => !hasSrStationLabel(stop.name)),
  )
  assert.equal(journey.legs[0].operatorUnconfirmed, true)
  assert.deepEqual(
    bookingLinks(journey).map((link) => link.id),
    ['korail', 'srt'],
  )
})

test('an explicitly supplied SRT type remains SRT with its own booking link', () => {
  const explicit = { ...source, trainType: 'SRT' }
  const [journey] = findJourneys(
    createTimetableIndex([explicit]),
    'dongdaegu',
    'source:suseo',
    { date },
  )
  assert.equal(hasUnconfirmedOperator(journey.legs[0]), false)
  assert.equal(trainTypeLabel(journey.legs[0]), 'SRT')
  assert.deepEqual(
    bookingLinks(journey).map((link) => link.id),
    ['srt'],
  )
})

test('ordinary services are not reclassified by their train number or display name', () => {
  const ordinary = {
    ...source,
    stops: source.stops.slice(0, 2),
    trainType: 'KTX',
  }
  ordinary.stops = ordinary.stops.map((stop, i) => ({
    ...stop,
    ...(i === 1 ? { departure: null } : {}),
  }))
  const [journey] = findJourneys(
    createTimetableIndex([ordinary]),
    'dongdaegu',
    'daejeon',
    { date },
  )
  assert.equal(journey.legs[0].operatorUnconfirmed, undefined)
  assert.equal(trainTypeLabel(journey.legs[0]), 'KTX')
  assert.deepEqual(
    bookingLinks(journey).map((link) => link.id),
    ['korail'],
  )
})
