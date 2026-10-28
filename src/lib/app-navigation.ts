import type { ServiceScope } from './service-explorer.ts'
import type { TrainFilter } from './train-filter.ts'
import { DEFAULT_TRAIN_FILTER } from './train-filter.ts'

export type AppTab = 'stations' | 'route' | 'discover' | 'network'
export interface ExplorerForm {
  mode: ServiceScope['mode']
  stationId: string
  region: string
  query: string
  trainFilter: TrainFilter
}
export interface ExplorerNavigation {
  date: string
  id: string
  depth: 0 | 1 | 2
  form: ExplorerForm
  page: number
  familyId: string | null
  routeId: string | null
  selectedId: string | null
  scrollTop: number
  scopeOpen: boolean
  advancedOpen: boolean
  focus: { kind: 'family' | 'route'; id: string } | null
}
export interface AppNavigation {
  version: 1
  tab: AppTab
  explorer?: ExplorerNavigation
}
const key = 'chicchicpokpok:navigation:v1'
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 2000
const nullableText = (value: unknown): value is string | null =>
  value === null || text(value)

export function readAppNavigation(state: unknown): AppNavigation | null {
  if (!object(state)) return null
  const value = state[key]
  if (
    !object(value) ||
    value.version !== 1 ||
    !['stations', 'route', 'discover', 'network'].includes(String(value.tab))
  )
    return null
  return value as unknown as AppNavigation
}

export function readExplorerNavigation(
  state: unknown,
  date: string,
): ExplorerNavigation | null {
  const app = readAppNavigation(state)
  if (app?.tab !== 'network') return null
  const value: unknown = app.explorer
  if (
    !object(value) ||
    value.date !== date ||
    !text(value.id) ||
    ![0, 1, 2].includes(Number(value.depth)) ||
    !Number.isInteger(value.depth)
  )
    return null
  if (
    !Number.isInteger(value.page) ||
    Number(value.page) < 0 ||
    !Number.isFinite(value.scrollTop) ||
    Number(value.scrollTop) < 0 ||
    typeof value.scopeOpen !== 'boolean' ||
    typeof value.advancedOpen !== 'boolean'
  )
    return null
  if (
    !nullableText(value.familyId) ||
    !nullableText(value.routeId) ||
    !nullableText(value.selectedId)
  )
    return null
  if (
    value.depth === 0 &&
    (value.familyId !== null ||
      value.routeId !== null ||
      value.selectedId !== null)
  )
    return null
  if (
    value.depth === 1 &&
    (!value.familyId || value.routeId !== null || value.selectedId !== null)
  )
    return null
  if (
    value.depth === 2 &&
    (!value.familyId || !value.routeId || !value.selectedId)
  )
    return null
  const form = value.form
  if (
    !object(form) ||
    !['station', 'region', 'all'].includes(String(form.mode)) ||
    !text(form.stationId) ||
    !text(form.region) ||
    !text(form.query)
  )
    return null
  const filter = form.trainFilter
  if (
    !object(filter) ||
    !['all', 'high-speed', 'conventional'].includes(String(filter.category)) ||
    typeof filter.includeUnknown !== 'boolean' ||
    !(
      filter.types === null ||
      (Array.isArray(filter.types) &&
        filter.types.length <= 50 &&
        filter.types.every(text))
    )
  )
    return null
  if (
    !(
      value.focus === null ||
      (object(value.focus) &&
        ['family', 'route'].includes(String(value.focus.kind)) &&
        text(value.focus.id))
    )
  )
    return null
  return value as unknown as ExplorerNavigation
}

export function navigationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

export function initialExplorerNavigation(
  date: string,
  stationId: string,
  region: string,
): ExplorerNavigation {
  return {
    date,
    id: navigationId(),
    depth: 0,
    form: {
      mode: 'station',
      stationId,
      region,
      query: '',
      trainFilter: DEFAULT_TRAIN_FILTER,
    },
    page: 0,
    familyId: null,
    routeId: null,
    selectedId: null,
    scrollTop: 0,
    scopeOpen: true,
    advancedOpen: false,
    focus: null,
  }
}

export function writeAppNavigation(
  value: AppNavigation,
  mode: 'push' | 'replace',
  target: Pick<
    History,
    'state' | 'pushState' | 'replaceState'
  > = window.history,
): boolean {
  try {
    const state = {
      ...(object(target.state) ? target.state : {}),
      [key]: value,
    }
    if (mode === 'push') target.pushState(state, '')
    else target.replaceState(state, '')
    return true
  } catch {
    // Local buttons remain usable if browser history is unavailable.
    return false
  }
}
