import type { Journey } from '../types.ts'
import { hasUnconfirmedOperator } from './train-labels.ts'

const official = {
  korail: {
    id: 'korail',
    label: '코레일 공식 예매',
    url: 'https://www.letskorail.com/',
  },
  srt: {
    id: 'srt',
    label: 'SRT 공식 예매',
    url: 'https://etk.srail.kr/main.do',
  },
} as const

export function bookingLinks(journey: Journey) {
  const providers = new Set<'korail' | 'srt'>()
  for (const leg of journey.legs) {
    if (leg.trainType && /SRT/i.test(leg.trainType)) providers.add('srt')
    else if (hasUnconfirmedOperator(leg)) {
      providers.add('korail')
      providers.add('srt')
    } else if (
      leg.trainType &&
      /KTX|ITX|무궁화|새마을|누리로|통근|청춘|마음/.test(leg.trainType)
    )
      providers.add('korail')
    else {
      providers.add('korail')
      providers.add('srt')
    }
  }
  return [...providers].map((provider) => official[provider])
}
