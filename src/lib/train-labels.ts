import type { JourneyLeg } from '../types.ts'
import { hasSrStationLabel } from './station-labels.ts'

type ServiceContext = Pick<
  JourneyLeg,
  'trainType' | 'stops' | 'operatorUnconfirmed'
>

// TAGO vehicle categories do not independently identify an operator. Keep the
// uncertainty from the complete service even when the selected leg omits its
// SR-labelled stops; do not infer an operator from its train number.
export function hasUnconfirmedOperator(service: ServiceContext): boolean {
  return (
    !/SRT/i.test(service.trainType ?? '') &&
    (service.operatorUnconfirmed === true ||
      service.stops.some((stop) => hasSrStationLabel(stop.name)))
  )
}

export function trainTypeLabel(service: ServiceContext): string | null {
  if (!service.trainType) return null
  return hasUnconfirmedOperator(service)
    ? `차량 ${service.trainType}`
    : service.trainType
}
