export type TrainCategory = 'all' | 'high-speed' | 'conventional'

export interface TrainFilter {
  category: TrainCategory
  /** null selects all known types in the category; [] selects none. */
  types: string[] | null
  includeUnknown: boolean
}

export const DEFAULT_TRAIN_FILTER: TrainFilter = {
  category: 'all',
  types: null,
  includeUnknown: true,
}

export const TRAIN_CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: 'high-speed', label: '고속열차' },
  { value: 'conventional', label: '일반열차' },
] as const

export function trainTypeKey(type: string): string {
  return type.normalize('NFKC').replace(/\s+/g, '').toUpperCase()
}

// Classify only the supplied vehicle name, never station prefixes or numbers.
export function trainCategory(
  type: string | null | undefined,
): Exclude<TrainCategory, 'all'> | null {
  if (!type) return null
  const name = trainTypeKey(type)
  if (/^(KTX|SRT)(?:$|[-(])/.test(name)) return 'high-speed'
  if (
    /^(ITX(?:$|[-(])|무궁화(?:호|$)|새마을(?:호|$)|누리로(?:호|$)|통근(?:열차|$))/.test(
      name,
    )
  )
    return 'conventional'
  return null
}

export function matchesTrainFilter(
  type: string | null | undefined,
  filter?: TrainFilter,
): boolean {
  if (!filter) return true
  const category = trainCategory(type)
  if (category === null) return filter.includeUnknown
  if (filter.category !== 'all' && category !== filter.category) return false
  return filter.types === null || filter.types.includes(trainTypeKey(type!))
}

export function availableTrainTypes(
  types: string[],
  category: TrainCategory,
): { key: string; label: string }[] {
  return [
    ...new Map(
      types.flatMap((type) => {
        const kind = trainCategory(type)
        return kind && (category === 'all' || category === kind)
          ? [
              [
                trainTypeKey(type),
                { key: trainTypeKey(type), label: type.trim() },
              ] as const,
            ]
          : []
      }),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, 'ko'))
}

export function trainFilterLabel(filter: TrainFilter): string {
  const category = TRAIN_CATEGORIES.find(
    (item) => item.value === filter.category,
  )!.label
  const selection =
    filter.types === null
      ? category
      : `${category} · ${filter.types.length}종 선택`
  if (
    filter.category === 'all' &&
    filter.types === null &&
    filter.includeUnknown
  )
    return '전체 열차'
  return `${selection} · 미확인 ${filter.includeUnknown ? '포함' : '제외'}`
}
