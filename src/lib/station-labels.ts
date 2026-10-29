// Display aliases only: source names and station IDs remain unchanged.
const srStationLabels = new Map([
  ['S수서', '수서'],
  ['S동탄', '동탄'],
  ['S평택지제', '평택지제'],
])

export function stationLabel(name: string): string {
  return srStationLabels.get(name.trim()) ?? name
}

export function hasSrStationLabel(name: string): boolean {
  return srStationLabels.has(name.trim())
}

// Dropdown labels and their ordering must use the same public station name.
// Keep the original IDs distinct when two source names have the same label.
export function compareStationLabels(
  a: { id: string; name: string },
  b: { id: string; name: string },
): number {
  return (
    stationLabel(a.name).localeCompare(stationLabel(b.name), 'ko') ||
    a.id.localeCompare(b.id)
  )
}
