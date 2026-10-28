import test from 'node:test'
import assert from 'node:assert/strict'
import {
  initialExplorerNavigation,
  navigationId,
  readAppNavigation,
  readExplorerNavigation,
  writeAppNavigation,
} from '../src/lib/app-navigation.ts'
import type { AppNavigation } from '../src/lib/app-navigation.ts'

const date = '20261027'
function browserHistory() {
  let position = 0
  const entries: unknown[] = [{ unrelated: 'preserved' }]
  return {
    get state() {
      return entries[position]
    },
    pushState(state: unknown) {
      entries.splice(position + 1)
      entries.push(structuredClone(state))
      position++
    },
    replaceState(state: unknown) {
      entries[position] = structuredClone(state)
    },
    back() {
      if (position) position--
    },
    forward() {
      if (position + 1 < entries.length) position++
    },
    get length() {
      return entries.length
    },
  }
}

test('browser history retains independent forms, pages, focus and exact service choices across levels', () => {
  const history = browserHistory(),
    root = initialExplorerNavigation(date, 'dongdaegu', '영남')
  root.form.query = '동대구역'
  root.form.trainFilter = {
    category: 'high-speed',
    types: ['KTX-이음'],
    includeUnknown: false,
  }
  root.scrollTop = 122
  root.scopeOpen = false
  root.advancedOpen = true
  root.focus = { kind: 'family', id: 'ktx' }
  assert.equal(
    writeAppNavigation(
      { version: 1, tab: 'network', explorer: root },
      'replace',
      history,
    ),
    true,
  )
  const family = {
    ...structuredClone(root),
    id: navigationId(),
    depth: 1 as const,
    familyId: 'ktx',
    page: 1,
    scrollTop: 360,
    focus: { kind: 'route' as const, id: '["a","b"]' },
  }
  writeAppNavigation(
    { version: 1, tab: 'network', explorer: family },
    'push',
    history,
  )
  const service = {
    ...structuredClone(family),
    id: navigationId(),
    depth: 2 as const,
    routeId: '["a","b"]',
    selectedId: 'record:102',
    scrollTop: 0,
  }
  writeAppNavigation(
    { version: 1, tab: 'network', explorer: service },
    'push',
    history,
  )
  service.selectedId = 'record:104'
  service.scrollTop = 460
  writeAppNavigation(
    { version: 1, tab: 'network', explorer: service },
    'replace',
    history,
  )
  assert.equal(
    history.length,
    3,
    'Choosing another time must not add another back step',
  )
  history.back()
  assert.deepEqual(readExplorerNavigation(history.state, date), family)
  history.back()
  assert.deepEqual(readExplorerNavigation(history.state, date), root)
  history.forward()
  history.forward()
  assert.deepEqual(readExplorerNavigation(history.state, date), service)
  assert.equal((history.state as { unrelated: string }).unrelated, 'preserved')
})

test('other app tabs remain distinct history entries and do not masquerade as explorer state', () => {
  const history = browserHistory()
  writeAppNavigation({ version: 1, tab: 'stations' }, 'replace', history)
  writeAppNavigation(
    {
      version: 1,
      tab: 'network',
      explorer: initialExplorerNavigation(date, 'a', '서울'),
    },
    'push',
    history,
  )
  writeAppNavigation({ version: 1, tab: 'discover' }, 'push', history)
  assert.equal(readExplorerNavigation(history.state, date), null)
  history.back()
  assert.equal(readAppNavigation(history.state)?.tab, 'network')
  history.back()
  assert.equal(readAppNavigation(history.state)?.tab, 'stations')
  history.forward()
  assert.equal(readExplorerNavigation(history.state, date)?.form.stationId, 'a')
})

test('stale dates and malformed navigation snapshots cannot restore invalid selections or filters', () => {
  const history = browserHistory(),
    valid = initialExplorerNavigation(date, 'a', '서울')
  writeAppNavigation(
    { version: 1, tab: 'network', explorer: valid },
    'replace',
    history,
  )
  assert.equal(readExplorerNavigation(history.state, '20261028'), null)
  const invalid = [
    {
      ...valid,
      depth: 2,
      familyId: null,
      routeId: 'route',
      selectedId: 'train',
    },
    { ...valid, depth: 0, familyId: 'ktx' },
    { ...valid, page: -1 },
    { ...valid, scrollTop: Infinity },
    {
      ...valid,
      form: {
        ...valid.form,
        trainFilter: { category: 'all', types: 3, includeUnknown: true },
      },
    },
    { ...valid, focus: { kind: 'script', id: 'x' } },
  ]
  for (const explorer of invalid) {
    writeAppNavigation(
      { version: 1, tab: 'network', explorer } as AppNavigation,
      'replace',
      history,
    )
    assert.equal(readExplorerNavigation(history.state, date), null)
  }
  for (const state of [
    null,
    [],
    {},
    { 'chicchicpokpok:navigation:v1': { version: 2, tab: 'network' } },
    { 'chicchicpokpok:navigation:v1': { version: 1, tab: 'unknown' } },
  ])
    assert.equal(readAppNavigation(state), null)
})

test('a browser that rejects history writes can still use local navigation fallback', () => {
  const unavailable = {
    state: null,
    pushState() {
      throw new Error('unavailable')
    },
    replaceState() {
      throw new Error('unavailable')
    },
  }
  assert.equal(
    writeAppNavigation({ version: 1, tab: 'network' }, 'push', unavailable),
    false,
  )
  assert.equal(
    writeAppNavigation({ version: 1, tab: 'stations' }, 'replace', unavailable),
    false,
  )
})
