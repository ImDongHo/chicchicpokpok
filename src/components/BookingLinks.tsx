import type { Journey } from '../types.ts'
import { bookingLinks } from '../lib/booking.ts'
import { hasUnconfirmedOperator } from '../lib/train-labels.ts'
import { Icon } from './Icon.tsx'

export function BookingLinks({ journey }: { journey: Journey }) {
  return (
    <div className="booking-links">
      <div>
        {bookingLinks(journey).map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label}
            <Icon name="arrow" size={13} />
          </a>
        ))}
      </div>
      <p>
        {journey.legs.some(hasUnconfirmedOperator) && (
          <>이 편은 운영사 확인이 필요해 코레일·SRT 예매를 함께 안내합니다. </>
        )}
        공식 사이트에서 여행 날짜와 최신 시간표·좌석을 다시 선택해 주세요. 이
        화면은 운행 기록이며 좌석 예약 결과가 아닙니다.
      </p>
    </div>
  )
}
