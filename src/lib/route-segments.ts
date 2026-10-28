import type { ConnectionSegment, Journey, RailLine } from '../types.ts'
import { formatKoreaTime } from './timetable.ts'
import { trainTypeLabel } from './train-labels.ts'

const colors = [
  '#2563eb',
  '#c2410c',
  '#7c3aed',
  '#047857',
  '#be185d',
  '#0e7490',
  '#a16207',
  '#475569',
]
type Cost = [number, number, number]

export function buildJourneySegments(
  journey: Journey,
  date: string,
): ConnectionSegment[] {
  let startIndex = 0
  return journey.legs.map((leg, index) => {
    const endIndex = startIndex + leg.stops.length - 1
    const segment: ConnectionSegment = {
      lineId: leg.tripId,
      lineName: trainTypeLabel(leg) ?? '차종 미제공',
      trainNumbers: [leg.trainNumber],
      stationIds: leg.stops.map((stop) => stop.stationId),
      startIndex,
      endIndex,
      directionConfirmed: true,
      color: colors[index % colors.length],
      label: `${index + 1}. ${trainTypeLabel(leg) ?? '열차'} ${leg.trainNumber}호 · ${formatKoreaTime(leg.departureAt, date)} → ${formatKoreaTime(leg.arrivalAt, date)}${leg.trainType ? '' : ' · 차종 미제공'}`,
      ...(index
        ? {
            transferMinutes: Math.floor(
              (leg.departureAt - journey.legs[index - 1].arrivalAt) / 60000,
            ),
          }
        : {}),
    }
    startIndex = endIndex
    return segment
  })
}

interface MapPath {
  stationIds: string[]
  missingStationIds: string[]
}

// Keep each known run and explicitly mark links over missing intermediate
// locations. No marker, coordinate or extra service is invented for those stops.
export function buildMapPaths(ids: string[], knownIds: Set<string>): MapPath[] {
  const result: MapPath[] = []
  let current: string[] = [],
    missing: string[] = []
  let lastKnown: string | undefined
  for (const id of ids) {
    if (!knownIds.has(id)) {
      if (current.length > 1)
        result.push({ stationIds: current, missingStationIds: [] })
      current = []
      missing.push(id)
      continue
    }
    if (missing.length) {
      if (lastKnown !== undefined && lastKnown !== id)
        result.push({ stationIds: [lastKnown, id], missingStationIds: missing })
      missing = []
    }
    current.push(id)
    lastKnown = id
  }
  if (current.length > 1)
    result.push({ stationIds: current, missingStationIds: [] })
  return result
}

export function buildSegmentedMapPaths(
  segments: ConnectionSegment[],
  knownIds: Set<string>,
): (MapPath & { segmentIndex: number | null })[] {
  const paths: (MapPath & { segmentIndex: number | null })[] = segments.flatMap(
    (segment, segmentIndex) =>
      buildMapPaths(segment.stationIds, knownIds).map((path) => ({
        ...path,
        segmentIndex,
      })),
  )
  const key = (path: MapPath) =>
    JSON.stringify([path.stationIds, path.missingStationIds])
  const covered = new Set(
    paths.filter((path) => path.missingStationIds.length).map(key),
  )
  const whole = segments.flatMap((segment, index) =>
    index ? segment.stationIds.slice(1) : segment.stationIds,
  )
  for (const path of buildMapPaths(whole, knownIds)) {
    // A transfer without a verified location has no color boundary to place on
    // the map. Join its nearest known stations in a separate neutral style.
    if (path.missingStationIds.length && !covered.has(key(path))) {
      paths.push({ ...path, segmentIndex: null })
      covered.add(key(path))
    }
  }
  return paths
}

interface Choice {
  line: RailLine | null
  end: number
  forward: boolean
  cost: Cost
}

// Describe contiguous train-path candidates on an existing graph connection.
// This does not select an actual departure, validate transfer times or invent a service.
export function buildConnectionSegments(
  lines: RailLine[],
  path: string[] | null,
): ConnectionSegment[] {
  if (!path || path.length < 2) return []
  const occurrences = new Map<string, { line: RailLine; offset: number }[]>()
  for (const line of lines)
    for (let offset = 0; offset < line.stations.length; offset++) {
      const id = line.stations[offset]
      if (!occurrences.has(id)) occurrences.set(id, [])
      occurrences.get(id)!.push({ line, offset })
    }
  const best: Choice[] = new Array(path.length)
  best[path.length - 1] = {
    line: null,
    end: path.length - 1,
    forward: true,
    cost: [0, 0, 0],
  }
  const better = (a: Choice, b: Choice) => {
    for (let i = 0; i < 3; i++)
      if (a.cost[i] !== b.cost[i]) return a.cost[i] < b.cost[i]
    if (a.end !== b.end) return a.end > b.end
    return (a.line?.id ?? '').localeCompare(b.line?.id ?? '') < 0
  }
  for (let start = path.length - 2; start >= 0; start--) {
    const tail = best[start + 1].cost
    best[start] = {
      line: null,
      end: start + 1,
      forward: false,
      cost: [tail[0] + 1, tail[1], tail[2] + 1],
    }
    for (const { line, offset } of occurrences.get(path[start]) ?? []) {
      for (const direction of [1, -1]) {
        for (let end = start + 1; end < path.length; end++) {
          if (line.stations[offset + direction * (end - start)] !== path[end])
            break
          const next = best[end].cost
          const candidate: Choice = {
            line,
            end,
            forward: direction === 1,
            cost: [
              next[0],
              next[1] + (direction === -1 ? end - start : 0),
              next[2] + 1,
            ],
          }
          if (better(candidate, best[start])) best[start] = candidate
        }
      }
    }
  }
  const segments: ConnectionSegment[] = []
  for (let start = 0; start < path.length - 1; ) {
    const choice = best[start]
    const line = choice.line
    const previous = segments.at(-1)
    if (!line && previous?.lineId === null) {
      previous.stationIds.push(...path.slice(start + 1, choice.end + 1))
      previous.endIndex = choice.end
    } else {
      const trainNumbers = [...new Set(line?.trainNumbers ?? [])].sort()
      const name = line?.name ?? '운행 정보 미확인'
      const numberLabel = trainNumbers.length
        ? ` · 열차 후보 ${trainNumbers[0]}${trainNumbers.length > 1 ? ` 외 ${trainNumbers.length - 1}편` : ''}`
        : ''
      const qualifier = !line
        ? ''
        : !trainNumbers.length
          ? ' · 노선 기준'
          : !choice.forward
            ? ' · 방향 미확인'
            : ''
      segments.push({
        lineId: line?.id ?? null,
        lineName: name,
        trainNumbers,
        stationIds: path.slice(start, choice.end + 1),
        startIndex: start,
        endIndex: choice.end,
        directionConfirmed: !!line && choice.forward && trainNumbers.length > 0,
        color: line ? colors[segments.length % colors.length] : '#64748b',
        label: `${segments.length + 1}. ${name}${numberLabel}${qualifier}`,
      })
    }
    start = choice.end
  }
  return segments
}
