import type { ConnectionSegment, RailLine } from '../types.ts'

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
