import type { RailLine, Station } from '../types.ts'
import {
  stations as sampleStations,
  lines as sampleLines,
  regions,
} from './sample-railway.ts'

interface Dataset {
  stations: Station[]
  lines: RailLine[]
  metadata: { kind: 'collected'; dataDate: string }
}
const generated = import.meta.glob<Dataset>('./generated/railway.json', {
  eager: true,
  import: 'default',
})
const dataset = generated['./generated/railway.json']
export const isSampleData = !dataset
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
export const stationLines = (id: string) => [
  ...new Map(
    lines
      .filter((line) => line.stations.includes(id))
      .map((line) => [line.name, line]),
  ).values(),
]
export { regions }
