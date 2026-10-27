import test from 'node:test'
import assert from 'node:assert/strict'
import { getMapStations, MAX_MAP_STATIONS } from '../src/lib/map-visibility.ts'
import type { MapViewport } from '../src/lib/map-visibility.ts'
import type { Station } from '../src/types.ts'

const viewport: MapViewport = {
  south: 35,
  north: 38,
  west: 126,
  east: 130,
  lat: 36.5,
  lng: 128,
  level: 8,
}
const station = (id: string, lat: number, lng: number): Station => ({
  id,
  name: id,
  region: '서울',
  area: '',
  description: '',
  lat,
  lng,
})
const denseStations = Array.from({ length: 300 }, (_, i) =>
  station(String(i), 36 + (i % 20) / 20, 127 + Math.floor(i / 20) / 20),
)

test('nationwide overview creates no station overlays until zooming in', () => {
  assert.deepEqual(
    getMapStations(denseStations, { ...viewport, level: 12 }, [], true),
    [],
  )
  assert.equal(
    getMapStations(denseStations, viewport, [], true).length,
    MAX_MAP_STATIONS,
  )
})

test('dense station sets are capped and offscreen stations are excluded', () => {
  const view = {
    ...viewport,
    south: 36.1,
    north: 36.4,
    west: 127.1,
    east: 127.4,
  }
  const visible = getMapStations(denseStations, view)
  assert.ok(visible.length > 0 && visible.length <= MAX_MAP_STATIONS)
  assert.ok(
    visible.every(
      (s) =>
        s.lat >= view.south &&
        s.lat <= view.north &&
        s.lng >= view.west &&
        s.lng <= view.east,
    ),
  )
  assert.deepEqual(getMapStations([station('far-away', 34, 125)], view), [])
})

test('the selected station and route endpoints survive the overlay cap when in view', () => {
  const visible = getMapStations(denseStations, viewport, ['299', '0'])
  assert.equal(visible.length, MAX_MAP_STATIONS)
  assert.ok(visible.some((s) => s.id === '299'))
  assert.ok(visible.some((s) => s.id === '0'))
  assert.deepEqual(
    getMapStations([station('outside', 34, 128)], viewport, ['outside']),
    [],
  )
})

test('nearest visible stations are prioritized without mutating the full dataset', () => {
  const original = [
    station('far', 35.2, 129.5),
    station('near', 36.5, 128),
    station('middle', 36.8, 128),
  ]
  assert.deepEqual(
    getMapStations(original, viewport).map((s) => s.id),
    ['near', 'middle', 'far'],
  )
  assert.deepEqual(
    original.map((s) => s.id),
    ['far', 'near', 'middle'],
  )
})

test('an explicitly selected region remains available without drawing a nationwide overview', () => {
  const local = [
    station('seoul', 37.55, 126.97),
    station('yongsan', 37.53, 126.96),
  ]
  assert.equal(
    getMapStations(local, { ...viewport, level: 12 }, [], false).length,
    2,
  )
})
