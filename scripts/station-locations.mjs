import municipalities from './data/kostat-municipalities-2013.json' with { type: 'json' }

// KOSTAT 2013 boundaries, with a 4 km tolerance for simplification, station
// entrances and subsequent boundary adjustments. This checks address consistency;
// it does not certify an exact platform or replace missing coordinates.
const borderToleranceKm = 4
const provinces = [
  ['서울', '11'],
  ['부산', '21'],
  ['대구', '22'],
  ['인천', '23'],
  ['광주', '24'],
  ['대전', '25'],
  ['울산', '26'],
  ['세종', '29'],
  ['경기', '31'],
  ['강원', '32'],
  ['충청북', '33'],
  ['충북', '33'],
  ['충청남', '34'],
  ['충남', '34'],
  ['전라북', '35'],
  ['전북', '35'],
  ['전라남', '36'],
  ['전남', '36'],
  ['경상북', '37'],
  ['경북', '37'],
  ['경상남', '38'],
  ['경남', '38'],
  ['제주', '39'],
]

function insideRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
    const a = ring[previous],
      b = ring[i]
    if (
      a[1] > lat !== b[1] > lat &&
      lng < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

function distanceToRing(lng, lat, ring) {
  const longitudeScale = Math.cos((lat * Math.PI) / 180)
  let distance = Infinity
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
    const a = ring[previous],
      b = ring[i]
    const ax = (a[0] - lng) * 111.2 * longitudeScale,
      ay = (a[1] - lat) * 111.2
    const dx = (b[0] - a[0]) * 111.2 * longitudeScale,
      dy = (b[1] - a[1]) * 111.2
    const fraction =
      dx || dy
        ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        : 0
    distance = Math.min(
      distance,
      Math.hypot(ax + fraction * dx, ay + fraction * dy),
    )
  }
  return distance
}

function addressBoundaries(address) {
  const normalized = address.replace(/\s/g, '')
  const province = provinces.find(([prefix]) =>
    normalized.startsWith(prefix),
  )?.[1]
  if (!province) return []
  const candidates = municipalities.features.filter(
    (feature) =>
      feature.properties.code.startsWith(province) ||
      // Gunwi moved from Gyeongbuk into Daegu in 2023.
      (province === '22' &&
        normalized.includes('군위군') &&
        feature.properties.name === '군위군'),
  )
  const city = /(?:도|특별자치도)([^시]+시)/.exec(normalized)?.[1]
  let matches = candidates.filter((feature) => {
    const name = feature.properties.name
    return (
      normalized.includes(name) ||
      (city && name.startsWith(city)) ||
      (city === '청주시' && name === '청원군') ||
      (normalized.includes('여주시') && name === '여주군')
    )
  })
  if (!matches.length) matches = candidates
  return matches
}

export function checkStationLocation(lat, lng, address) {
  if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132))
    return { valid: false, reason: 'invalid-country-coordinates' }
  const boundaries = addressBoundaries(address)
  if (!boundaries.length)
    return { valid: false, reason: 'address-boundary-unavailable' }
  let distanceKm = Infinity
  for (const feature of boundaries) {
    const geometry = feature.geometry
    const polygons =
      geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [geometry.coordinates]
    for (const polygon of polygons) {
      if (
        insideRing(lng, lat, polygon[0]) &&
        !polygon.slice(1).some((ring) => insideRing(lng, lat, ring))
      )
        return { valid: true }
      for (const ring of polygon)
        distanceKm = Math.min(distanceKm, distanceToRing(lng, lat, ring))
    }
  }
  return distanceKm <= borderToleranceKm
    ? { valid: true }
    : {
        valid: false,
        reason: 'coordinate-address-mismatch',
        distanceKm: Math.round(distanceKm * 10) / 10,
      }
}

// The ODCloud 2025-07-11 source interchanges these two coordinate pairs.
// Reviewed 2026-10-28 against each station's address and KOSTAT municipality.
// Apply only to the known bad pair; an upstream correction always takes precedence.
const reviewedCorrections = {
  청량리: {
    original: [37.11298, 129.036482],
    corrected: [37.579983, 127.047679],
    sourceRow: '철암',
  },
  철암: {
    original: [37.579983, 127.047679],
    corrected: [37.11298, 129.036482],
    sourceRow: '청량리',
  },
}

export function stationLocation(name, lat, lng, address) {
  const correction = Object.hasOwn(reviewedCorrections, name)
    ? reviewedCorrections[name]
    : null
  if (
    correction &&
    Math.abs(lat - correction.original[0]) < 0.000001 &&
    Math.abs(lng - correction.original[1]) < 0.000001
  ) {
    const [correctedLat, correctedLng] = correction.corrected
    if (checkStationLocation(correctedLat, correctedLng, address).valid)
      return {
        lat: correctedLat,
        lng: correctedLng,
        validation: { valid: true },
        correction: { sourceRow: correction.sourceRow, original: { lat, lng } },
      }
  }
  return { lat, lng, validation: checkStationLocation(lat, lng, address) }
}
