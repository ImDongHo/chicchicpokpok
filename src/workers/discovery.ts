import { recommendDestinations } from '../lib/recommendations.ts'
import type { DiscoveryOptions } from '../lib/recommendations.ts'
import type { TimetableIndex } from '../lib/timetable.ts'
import type { Station } from '../types.ts'

self.onmessage = (
  event: MessageEvent<{
    id: number
    index: TimetableIndex
    stations: Station[]
    from: string
    options: DiscoveryOptions
  }>,
) => {
  const { id, index, stations, from, options } = event.data
  try {
    self.postMessage({
      id,
      // The UI paginates these results; eligibility must cover every city.
      results: recommendDestinations(index, stations, from, {
        ...options,
        limit: stations.length,
      }),
    })
  } catch {
    self.postMessage({
      id,
      error:
        '추천 경로를 계산하지 못했습니다. 조건을 변경해 다시 시도해 주세요.',
    })
  }
}
