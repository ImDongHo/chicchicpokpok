import { stationLabel } from '../lib/station-labels.ts'
import type { DestinationRecommendation } from '../lib/recommendations.ts'
import type { JourneySearchOptions } from '../lib/timetable.ts'
import { formatKoreaTime } from '../lib/timetable.ts'
import { Icon } from './Icon.tsx'

type Scene = 'coast' | 'river' | 'heritage' | 'city' | 'mountain'
interface Story {
  scene: Scene
  line: string
  tags: [string, string]
}

// Editorial descriptions of the destination city, not sights within walking
// distance of its station or additional claims about the train service.
const stories: Record<string, Story> = {
  강릉: {
    scene: 'coast',
    line: '바다를 보고, 커피 한 잔의 여유.',
    tags: ['바다 풍경', '커피 산책'],
  },
  부산: {
    scene: 'coast',
    line: '바다와 골목 사이, 나만의 부산.',
    tags: ['바다 풍경', '동네 산책'],
  },
  동해: {
    scene: 'coast',
    line: '파도 소리를 따라 느리게 걷는 날.',
    tags: ['바다 풍경', '느린 여행'],
  },
  여수: {
    scene: 'coast',
    line: '바다 곁에서 조금 더 머물고 싶은 날.',
    tags: ['바다 풍경', '도시 산책'],
  },
  목포: {
    scene: 'coast',
    line: '항구의 풍경과 오래된 골목을 따라.',
    tags: ['항구 풍경', '골목 산책'],
  },
  포항: {
    scene: 'coast',
    line: '바다를 향해 떠나는 하루.',
    tags: ['바다 풍경', '도시 여행'],
  },
  양평: {
    scene: 'river',
    line: '강변의 풍경에 잠시 쉬어 가기.',
    tags: ['강변 풍경', '자연 휴식'],
  },
  춘천: {
    scene: 'river',
    line: '물빛 풍경 곁에서 보내는 느린 하루.',
    tags: ['호수 풍경', '느린 여행'],
  },
  제천: {
    scene: 'mountain',
    line: '산과 호수의 풍경을 만나는 여행.',
    tags: ['자연 풍경', '여유로운 하루'],
  },
  평창: {
    scene: 'mountain',
    line: '산자락의 풍경으로 기분 전환.',
    tags: ['산 풍경', '자연 휴식'],
  },
  영주: {
    scene: 'mountain',
    line: '산자락과 오래된 이야기를 따라.',
    tags: ['자연 풍경', '역사 여행'],
  },
  경주: {
    scene: 'heritage',
    line: '오래된 풍경 속을 천천히 걷기.',
    tags: ['역사 산책', '고즈넉한 풍경'],
  },
  전주: {
    scene: 'heritage',
    line: '골목마다 다른 이야기가 있는 곳.',
    tags: ['한옥 풍경', '골목 산책'],
  },
  공주: {
    scene: 'heritage',
    line: '백제의 이야기를 만나는 하루.',
    tags: ['백제 문화', '역사 산책'],
  },
  익산: {
    scene: 'heritage',
    line: '백제의 흔적을 따라 새로운 발견.',
    tags: ['백제 문화', '역사 여행'],
  },
  안동: {
    scene: 'heritage',
    line: '오래된 일상과 전통을 만나는 여행.',
    tags: ['전통 문화', '느린 여행'],
  },
  수원: {
    scene: 'heritage',
    line: '성곽과 골목을 따라 걷는 하루.',
    tags: ['역사 산책', '도시 여행'],
  },
  대전: {
    scene: 'city',
    line: '익숙한 도시에도 새로운 취향이.',
    tags: ['도시 산책', '먹거리 여행'],
  },
  광명: {
    scene: 'city',
    line: '가까운 도시에서 찾는 새로운 취향.',
    tags: ['문화 산책', '도시 여행'],
  },
  아산: {
    scene: 'river',
    line: '온천 도시에서 보내는 느긋한 하루.',
    tags: ['온천 도시', '느린 여행'],
  },
  청주: {
    scene: 'city',
    line: '일상 속 문화와 골목의 발견.',
    tags: ['문화 산책', '도시 여행'],
  },
  서울: {
    scene: 'city',
    line: '골목마다 다른 표정의 도시.',
    tags: ['문화 산책', '동네 여행'],
  },
  대구: {
    scene: 'city',
    line: '골목의 이야기와 맛을 찾아서.',
    tags: ['골목 산책', '먹거리 여행'],
  },
  광주: {
    scene: 'city',
    line: '예술과 일상의 취향이 만나는 곳.',
    tags: ['문화 산책', '도시 여행'],
  },
}
const defaultStory: Story = {
  scene: 'city',
  line: '다음 정거장에서 시작되는 새로운 하루.',
  tags: ['기차 여행', '새로운 발견'],
}

function DestinationScene({ scene }: { scene: Scene }) {
  return (
    <svg viewBox="0 0 320 108" fill="none" aria-hidden="true" focusable="false">
      <path d="M0 0H320V108H0Z" fill="var(--scene-bg)" />
      <circle cx="265" cy="29" r="17" fill="#ead5b3" />
      <g
        stroke="var(--scene-ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {scene === 'coast' && (
          <>
            <path d="M-10 75Q25 57 60 75T130 75T200 75T270 75T340 75M-10 91Q25 73 60 91T130 91T200 91T270 91T340 91" />
            <path d="M151 64V23L126 57H151M157 35L175 59H157M124 65H181L174 72H132Z" />
            <path d="M36 34Q42 29 48 34Q54 29 60 34M196 23Q201 19 206 23" />
          </>
        )}
        {scene === 'river' && (
          <>
            <path d="M-12 74Q50 52 111 70T225 73T332 51M-8 95Q53 72 116 89T226 94T332 73" />
            <path
              d="M30 54Q74 3 119 54M185 48Q213 19 245 48"
              strokeOpacity=".55"
            />
            <path d="M89 64V50H227V65M94 50Q122 13 158 50Q190 13 222 50M124 50V70M158 50V73M192 50V74" />
          </>
        )}
        {scene === 'heritage' && (
          <>
            <path d="M0 91Q85 78 147 88T320 85" strokeOpacity=".55" />
            <path d="M79 72H226M99 71V52M116 71V52M190 71V52M207 71V52M88 52Q114 47 152 21Q188 47 217 52H88ZM111 34Q152 31 193 34M145 22V15H160V22M108 77H200" />
            <path d="M43 78V52M30 56Q25 35 43 35Q62 37 56 57Q43 65 30 56ZM269 79V57M260 59Q250 41 269 39Q289 42 278 59Z" />
          </>
        )}
        {scene === 'city' && (
          <>
            <path d="M17 84H303M47 84V49H79V84M91 84V29H131V84M142 84V58H173V84M187 84V42H220V84M55 57H70M55 65H70M100 39H121M100 48H121M100 57H121M152 66H163M197 52H210M197 61H210" />
            <path d="M257 84V57M246 59Q234 37 257 34Q281 38 268 60Q258 66 246 59ZM24 30H42M33 21V39" />
          </>
        )}
        {scene === 'mountain' && (
          <>
            <path d="M-15 87L75 16L164 87M105 87L193 30L285 87M220 87L275 47L334 87M58 30L75 43L91 29" />
            <path d="M0 99Q67 86 130 96T260 96T330 90M35 81V65M27 71L35 55L43 71ZM228 86V71M220 77L228 61L236 77Z" />
          </>
        )}
      </g>
    </svg>
  )
}

interface Props {
  result: DestinationRecommendation
  date: string
  from: string
  order: number
  onSelect: (from: string, to: string, options: JourneySearchOptions) => void
}

export function DestinationCard({
  result,
  date,
  from,
  order,
  onSelect,
}: Props) {
  const story = Object.hasOwn(stories, result.city)
    ? stories[result.city]
    : defaultStory
  return (
    <article className={`destination-card scene-${story.scene}`}>
      <div className="destination-scene" aria-hidden="true">
        <DestinationScene scene={story.scene} />
        <span className="destination-number">
          {String(order + 1).padStart(2, '0')}
        </span>
      </div>
      <div className="destination-body">
        <div className="destination-title">
          <h3>{result.city}</h3>
          <span>
            {result.outbound.legs.length === 1
              ? '직통'
              : `환승 ${result.outbound.legs.length - 1}회`}
          </span>
        </div>
        <p className="destination-story">{story.line}</p>
        <div className="destination-tags">
          {story.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="destination-itinerary">
          <div>
            <span>가는 편</span>
            <strong>
              {formatKoreaTime(result.outbound.departureAt, date)}
              <Icon name="arrow" size={14} />
              {formatKoreaTime(result.outbound.arrivalAt, date)}
            </strong>
            <small>
              {Math.round(
                (result.outbound.arrivalAt - result.outbound.departureAt) /
                  60000,
              )}
              분
            </small>
          </div>
          <p>
            {result.returning
              ? `귀가편 ${formatKoreaTime(result.returning.departureAt, date)} → ${formatKoreaTime(result.returning.arrivalAt, date)} 확인`
              : '귀가편 조건을 적용하지 않은 추천입니다.'}
          </p>
        </div>
        <p className="destination-station">
          <Icon name="pin" size={13} />
          {result.area} · {stationLabel(result.station.name)}역 도착
        </p>
        <div className="destination-actions">
          <button
            onClick={() =>
              onSelect(from, result.station.id, result.searchOptions)
            }
          >
            가는 편 보기
            <Icon name="arrow" size={14} />
          </button>
          {result.returning && result.returnOptions && (
            <button
              onClick={() =>
                onSelect(result.station.id, from, result.returnOptions!)
              }
            >
              오는 편 보기
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
