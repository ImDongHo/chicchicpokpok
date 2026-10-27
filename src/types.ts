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
}
