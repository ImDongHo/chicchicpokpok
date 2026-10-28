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
  transferMinutes?: number
}

export interface TrainStop {
  stationId: string
  name: string
  stationCode?: string
  sequence: number
  arrival: string | null
  departure: string | null
}

export interface TrainTrip {
  id: string
  date: string
  trainNumber: string
  trainType: string | null
  stops: TrainStop[]
}

export interface JourneyLeg {
  tripId: string
  trainNumber: string
  trainType: string | null
  operatorUnconfirmed?: boolean
  stops: TrainStop[]
  departureAt: number
  arrivalAt: number
}

export interface Journey {
  id: string
  legs: JourneyLeg[]
  departureAt: number
  arrivalAt: number
}

export type JourneyPreference = 'fastest' | 'fewest-transfers'
