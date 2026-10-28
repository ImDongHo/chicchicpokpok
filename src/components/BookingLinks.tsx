import type { Journey } from '../types.ts'
import { bookingLinks } from '../lib/booking.ts'
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
        공식 사이트에서 여행 날짜와 최신 시간표·좌석을 다시 선택해 주세요. 이
        화면은 운행 기록이며 좌석 예약 결과가 아닙니다.
      </p>
    </div>
  )
}
