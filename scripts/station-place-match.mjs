import { normalizeStationName } from './tago.mjs'
import { checkStationLocation } from './station-locations.mjs'

const canonical = (value) =>
  normalizeStationName(value).replace('여수엑스포', '여수expo')

export function missingStationLocations(dataset, trips) {
  const known = new Set(dataset.stations.map((station) => station.id))
  const groups = new Map()
  for (const trip of trips)
    for (const stop of trip.stops) {
      if (known.has(stop.stationId)) continue
      const name = canonical(stop.name)
      if (!groups.has(name))
        groups.set(name, {
          query: name + '역',
          name: stop.name,
          ids: new Map(),
        })
      groups.get(name).ids.set(stop.stationId, stop.name)
    }
  return [...groups.values()].map((group) => ({
    ...group,
    ids: [...group.ids].map(([id, name]) => ({ id, name })),
  }))
}

function distanceKm(a, b) {
  return Math.hypot(
    (a.lat - b.lat) * 111.2,
    (a.lng - b.lng) * 111.2 * Math.cos((a.lat * Math.PI) / 180),
  )
}

export function selectStationPlace(name, documents, addressHints = []) {
  const expected = canonical(name)
  const candidates = documents.flatMap((document) => {
    if (
      typeof document.place_name !== 'string' ||
      typeof document.category_name !== 'string'
    )
      return []
    if (
      !document.category_name
        .split('>')
        .some((part) => ['기차역', '철도역'].includes(part.trim())) ||
      /폐역|주차장|출구|매표소/.test(document.place_name)
    )
      return []
    const baseName = /^(.*?역)(?:\s|\(|$)/.exec(document.place_name)?.[1]
    if (!baseName || canonical(baseName) !== expected) return []
    const lat = Number(document.y),
      lng = Number(document.x)
    const area = String(
      document.road_address_name || document.address_name || '',
    ).trim()
    if (!checkStationLocation(lat, lng, area).valid) return []
    if (
      addressHints.length &&
      !addressHints.some(
        (address) => checkStationLocation(lat, lng, address).valid,
      )
    )
      return []
    if (!/^\d+$/.test(String(document.id))) return []
    return [
      {
        lat,
        lng,
        area,
        placeId: String(document.id),
        placeName: document.place_name,
        category: document.category_name,
      },
    ]
  })
  if (!candidates.length) return { status: 'not-verified' }
  if (
    candidates.some((candidate) => distanceKm(candidate, candidates[0]) > 0.5)
  )
    return { status: 'ambiguous' }
  return { status: 'verified', location: candidates[0] }
}

export function applyStationPlaces(dataset, groups) {
  const known = new Set(dataset.stations.map((station) => station.id))
  const added = []
  for (const group of groups) {
    if (group.match.status !== 'verified') continue
    const { lat, lng, area, placeId } = group.match.location
    for (const station of group.ids) {
      if (known.has(station.id)) continue
      const name = station.name
      const region = /^서울/.test(area)
        ? '서울'
        : /^(경기|인천)/.test(area)
          ? '경기'
          : /^강원/.test(area)
            ? '강원'
            : /^(충청|충북|충남|대전|세종)/.test(area)
              ? '충청'
              : /^(경상|경북|경남|부산|대구|울산)/.test(area)
                ? '영남'
                : /^(전라|전북|전남|광주)/.test(area)
                  ? '호남'
                  : '기타'
      const resolved = {
        id: station.id,
        name,
        lat,
        lng,
        area,
        region,
        description: '',
        locationSource: { provider: 'Kakao Places', placeId },
      }
      dataset.stations.push(resolved)
      added.push(resolved)
      known.add(station.id)
    }
  }
  dataset.stations.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  dataset.metadata.resolvedStationLocations = added.length
  return added
}
