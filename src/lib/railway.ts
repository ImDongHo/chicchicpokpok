import type { RailLine, Station } from '../types.ts'

export function searchStations(
  stations: Station[],
  query: string,
  region = '전체',
): Station[] {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/\s/g, '').replace(/역$/, '')
  const needle = normalize(query)
  const stationNameOnly = /역$/.test(query.replace(/\s/g, ''))
  return stations.filter(
    (station) =>
      (region === '전체' || station.region === region) &&
      (!needle ||
        normalize(
          stationNameOnly
            ? station.name
            : `${station.name} ${station.area} ${station.region}`,
        ).includes(needle)),
  )
}

// Fewest edges in the sample network. This does not infer a timetable, through train, or transfer.
export function findConnection(
  lines: RailLine[],
  start: string,
  end: string,
): string[] | null {
  const graph = new Map<string, Set<string>>()
  for (const line of lines) {
    for (const id of line.stations) if (!graph.has(id)) graph.set(id, new Set())
    for (let i = 1; i < line.stations.length; i++) {
      graph.get(line.stations[i - 1])!.add(line.stations[i])
      graph.get(line.stations[i])!.add(line.stations[i - 1])
    }
  }
  if (!graph.has(start) || !graph.has(end)) return null
  const previous = new Map<string, string | null>([[start, null]])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    if (current === end) {
      const path: string[] = []
      let cursor: string | null = end
      while (cursor !== null) {
        path.push(cursor)
        cursor = previous.get(cursor) ?? null
      }
      return path.reverse()
    }
    for (const next of graph.get(current)!) {
      if (!previous.has(next)) {
        previous.set(next, current)
        queue.push(next)
      }
    }
  }
  return null
}
