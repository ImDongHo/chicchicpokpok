import { useId } from 'react'
import {
  availableTrainTypes,
  TRAIN_CATEGORIES,
  trainFilterLabel,
} from '../lib/train-filter.ts'
import type { TrainFilter } from '../lib/train-filter.ts'
import { Icon } from './Icon.tsx'

interface Props {
  value: TrainFilter
  types: string[]
  onChange: (value: TrainFilter) => void
  hint?: string
}

export function TrainTypeFilter({
  value,
  types,
  onChange,
  hint = '환승 구간과 추천 귀가편에도 같은 조건을 적용합니다.',
}: Props) {
  const id = useId()
  const choices = availableTrainTypes(types, value.category)
  return (
    <fieldset className="train-type-filter" aria-describedby={`${id}-hint`}>
      <legend>열차 종류</legend>
      <div
        className="train-category-buttons"
        role="group"
        aria-label="열차 종류 범위"
      >
        {TRAIN_CATEGORIES.map(({ value: category, label }) => (
          <button
            key={category}
            type="button"
            aria-pressed={value.category === category}
            onClick={() =>
              onChange({
                category,
                types: null,
                includeUnknown: category === 'all',
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <details className="train-type-details">
        <summary>
          세부 종류
          <small title={trainFilterLabel(value)}>
            {trainFilterLabel(value)}
          </small>
          <Icon name="chevron" size={14} />
        </summary>
        <label className="train-type-choice">
          <input
            type="checkbox"
            checked={value.types === null}
            onChange={(event) =>
              onChange({ ...value, types: event.target.checked ? null : [] })
            }
          />
          이 범위의 모든 종류
        </label>
        <div className="train-type-choices">
          {choices.map(({ key, label }) => (
            <label className="train-type-choice" key={key}>
              <input
                type="checkbox"
                checked={value.types === null || value.types.includes(key)}
                onChange={(event) => {
                  const selected =
                    value.types ?? choices.map((choice) => choice.key)
                  onChange({
                    ...value,
                    types: event.target.checked
                      ? [...selected, key]
                      : selected.filter((type) => type !== key),
                  })
                }}
              />
              {label}
            </label>
          ))}
        </div>
        {!choices.length && <p>이 범위에서 확인된 차종이 없습니다.</p>}
        <label className="train-type-choice">
          <input
            type="checkbox"
            checked={value.includeUnknown}
            onChange={(event) =>
              onChange({ ...value, includeUnknown: event.target.checked })
            }
          />
          차종 미확인 포함
        </label>
        <p>
          수집 자료에 명시된 차종만 표시합니다. SRT는 원본에 명시된 편만
          구분합니다.
        </p>
      </details>
      <p className="train-filter-hint" id={`${id}-hint`}>
        {hint}
      </p>
      {value.types?.length === 0 && !value.includeUnknown && (
        <p className="train-filter-hint" role="status">
          검색할 열차 종류를 하나 이상 선택해 주세요.
        </p>
      )}
    </fieldset>
  )
}
