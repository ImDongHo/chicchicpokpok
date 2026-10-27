import test from 'node:test'
import assert from 'node:assert/strict'
import { stations, lines } from '../src/data/sample-railway.ts'
import { searchStations, findConnection } from '../src/lib/railway.ts'

test('sample network has unique stations, valid coordinates, and resolvable line stops', () => {
  const ids = new Set(stations.map((station) => station.id))
  assert.equal(ids.size, stations.length)
  for (const station of stations) {
    assert.ok(station.lat > 33 && station.lat < 39)
    assert.ok(station.lng > 125 && station.lng < 131)
  }
  for (const line of lines)
    for (const id of line.stations) assert.ok(ids.has(id), id)
})

test('station search accepts the 역 suffix and combines query with region', () => {
  assert.deepEqual(
    searchStations(stations, ' 서 울 역 ').map((s) => s.id),
    ['seoul'],
  )
  assert.equal(searchStations(stations, '부산', '서울').length, 0)
  assert.ok(
    searchStations(stations, '', '강원').every((s) => s.region === '강원'),
  )
  assert.deepEqual(searchStations(stations, '없는역'), [])
})

test('connection between different branches passes through Osong without repeating stops', () => {
  const path = findConnection(lines, 'busan', 'mokpo')!
  assert.equal(path[0], 'busan')
  assert.equal(path.at(-1), 'mokpo')
  assert.ok(path.includes('osong'))
  assert.equal(new Set(path).size, path.length)
})

test('connections work in both directions and handle same or unknown stations', () => {
  assert.deepEqual(
    findConnection(lines, 'gangneung', 'seoul'),
    findConnection(lines, 'seoul', 'gangneung')!.toReversed(),
  )
  assert.deepEqual(findConnection(lines, 'seoul', 'seoul'), ['seoul'])
  assert.equal(findConnection(lines, 'unknown', 'seoul'), null)
})

test('disconnected sample networks have no fabricated connection', () => {
  assert.equal(
    findConnection(
      [
        { id: 'a', name: 'a', color: '#000', stations: ['a', 'b'] },
        { id: 'c', name: 'c', color: '#000', stations: ['c', 'd'] },
      ],
      'a',
      'd',
    ),
    null,
  )
})
