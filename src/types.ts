export interface Station {
  id: string
  name: string
  region: string
  area: string
  lat: number
  lng: number
  description: string
}

export interface RailLine {
  id: string
  name: string
  color: string
  stations: string[]
  trainNumbers?: string[]
}

export interface ConnectionSegment {
  lineId: string | null
  lineName: string
  trainNumbers: string[]
  stationIds: string[]
  startIndex: number
  endIndex: number
  directionConfirmed: boolean
  color: string
  label: string
}
