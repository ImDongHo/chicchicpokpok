import test from 'node:test'
import assert from 'node:assert/strict'
import {
  missingStationLocations,
  selectStationPlace,
  applyStationPlaces,
} from '../scripts/station-place-match.mjs'

const station = { id: 'test-place', name: '김천구미' }
const document = {
  id: '123456',
  place_name: '김천구미역 경부고속선',
  category_name: '교통,수송 > 기차,철도 > 기차역 > KTX정차역',
  road_address_name: '경북 김천시 남면 혁신1로 51',
  address_name: '경북 김천시 남면 옥산리',
  x: '128.1810',
  y: '36.1135',
}

test('a missing Gimcheon-Gumi station is matched to the exact railway place rather than Gimcheon or a nearby car park', () => {
  const match = selectStationPlace(station.name, [
    { ...document, place_name: '김천역 경부선' },
    {
      ...document,
      place_name: '김천구미역 주차장',
      category_name: '교통,수송 > 주차장',
    },
    { ...document, place_name: '김천구미역(폐역)' },
    document,
  ])
  assert.equal(match.status, 'verified')
  assert.equal(match.location?.placeId, '123456')
  assert.equal(match.location?.lat, 36.1135)
  assert.equal(
    selectStationPlace(station.name, [{ ...document, place_name: '김천역' }])
      .status,
    'not-verified',
  )
})

test('place coordinates must match the address, and widely separated name matches remain unresolved', () => {
  assert.equal(
    selectStationPlace(station.name, [{ ...document, x: '129', y: '37.5' }])
      .status,
    'not-verified',
  )
  assert.equal(
    selectStationPlace(station.name, [document], ['서울특별시 동대문구'])
      .status,
    'not-verified',
  )
  assert.equal(
    selectStationPlace(station.name, [
      document,
      { ...document, id: '654321', x: '128.19', y: '36.14' },
    ]).status,
    'ambiguous',
  )
  assert.equal(selectStationPlace(station.name, []).status, 'not-verified')
})

test('station name aliases are checked without accepting a different station', () => {
  assert.equal(
    selectStationPlace('김천구미', [
      { ...document, place_name: '김천(구미)역' },
    ]).status,
    'verified',
  )
  assert.equal(selectStationPlace('구미', [document]).status, 'not-verified')
})

test('missing location queries are deduplicated and verified coordinates retain the original timetable station IDs', () => {
  const dataset = { stations: [{ id: 'daejeon', name: '대전' }], metadata: {} }
  const trip = {
    stops: [
      { stationId: 'unmapped:3900894', name: '김천구미' },
      { stationId: 'daejeon', name: '대전' },
    ],
  }
  const needs = missingStationLocations(dataset, [trip, trip])
  assert.equal(needs.length, 1)
  assert.equal(needs[0].query, '김천구미역')
  const match = selectStationPlace('김천구미', [document])
  const added = applyStationPlaces(
    dataset,
    needs.map((need) => ({ ...need, match })),
  )
  assert.equal(added[0].id, 'unmapped:3900894')
  assert.equal(added[0].region, '영남')
  assert.equal(added[0].locationSource.placeId, '123456')
  assert.equal(trip.stops[0].stationId, added[0].id)
  assert.equal(missingStationLocations(dataset, [trip]).length, 0)
  applyStationPlaces(
    dataset,
    needs.map((need) => ({ ...need, match })),
  )
  assert.equal(dataset.stations.length, 2)
})
