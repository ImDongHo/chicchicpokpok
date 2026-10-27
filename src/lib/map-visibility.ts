import type { Station } from '../types.ts'

export interface MapViewport {
  south: number
  north: number
  west: number
  east: number
  lat: number
  lng: number
  level: number
}

export const MAX_MAP_STATIONS = 40

// Keep the overview quiet and bound the number of DOM overlays at every zoom.
export function getMapStations(
  candidates: Station[],
  viewport: MapViewport,
  focusedIds: string[] = [],
  overview = false,
): Station[] {
  if (overview && viewport.level > 10) return []
  const priorities = new Set(focusedIds)
  const longitudeScale = Math.cos((viewport.lat * Math.PI) / 180)
  const distance = (station: Station) =>
    (station.lat - viewport.lat) ** 2 +
    ((station.lng - viewport.lng) * longitudeScale) ** 2
  return candidates
    .filter(
      (station) =>
        station.lat >= viewport.south &&
        station.lat <= viewport.north &&
        station.lng >= viewport.west &&
        station.lng <= viewport.east,
    )
    .sort(
      (a, b) =>
        Number(priorities.has(b.id)) - Number(priorities.has(a.id)) ||
        distance(a) - distance(b) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, MAX_MAP_STATIONS)
}
