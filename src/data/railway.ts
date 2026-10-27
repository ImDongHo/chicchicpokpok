import type { RailLine, Station } from '../types.ts'
import {
  stations as sampleStations,
  lines as sampleLines,
  regions,
} from './sample-railway.ts'

interface Dataset {
  stations: Station[]
  lines: RailLine[]
  metadata: { kind: 'collected'; dataDate: string; scheduleFile?: string }
}
const generated = import.meta.glob<Dataset>('./generated/railway.json', {
  eager: true,
  import: 'default',
})
const dataset = generated['./generated/railway.json']
export const isSampleData = !dataset
export const dataDate = dataset?.metadata.dataDate ?? ''
export const scheduleFile = dataset?.metadata.scheduleFile ?? null
export const datasetLabel = dataset
  ? `${dataset.metadata.dataDate.slice(0, 4)}.${dataset.metadata.dataDate.slice(4, 6)}.${dataset.metadata.dataDate.slice(6, 8)} 수집 철도망`
  : '샘플 철도망'
export const stations: Station[] = dataset?.stations ?? sampleStations
export const lines: RailLine[] = dataset?.lines ?? sampleLines
export const displayLines = [
  ...new Map(lines.map((line) => [line.name, line])).values(),
]
export const stationById = new Map(
  stations.map((station) => [station.id, station]),
)
const stationLineIndex = new Map<string, Map<string, RailLine>>()
for (const line of lines) {
  for (const id of line.stations) {
    if (!stationLineIndex.has(id)) stationLineIndex.set(id, new Map())
    stationLineIndex.get(id)!.set(line.name, line)
  }
}
const stationLineLists = new Map(
  [...stationLineIndex].map(([id, values]) => [id, [...values.values()]]),
)
export const stationLines = (id: string) => stationLineLists.get(id) ?? []
export { regions }
