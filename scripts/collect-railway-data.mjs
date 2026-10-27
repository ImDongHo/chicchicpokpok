import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const stationEndpoint =
  'https://api.odcloud.kr/api/15067652/v1/uddi:29222bc3-1bc1-44bd-9ad6-9210ddb9a6ca'
const runEndpoint = 'https://apis.data.go.kr/B551457/run/v2'
const colors = [
  '#267a65',
  '#df9c4c',
  '#9271b3',
  '#5d96ba',
  '#ba7974',
  '#76894a',
]
class CollectionError extends Error {}
const fail = (message) => {
  throw new CollectionError(message)
}

export function validateDate(value) {
  if (!/^\d{8}$/.test(value)) fail('Data date must be YYYYMMDD.')
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  const date = new Date(iso + 'T00:00:00Z')
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    fail('Invalid data date.')
  return value
}

export function previousKoreaDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000 - 86400000)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '')
}

export function unpackPage(payload, kind) {
  let records, total, page
  if (kind === 'station') {
    records = payload.data
    total = payload.matchCount ?? payload.totalCount
    page = payload.page
  } else {
    const response = payload.response
    const code = response?.header?.resultCode ?? response?.body?.resultCode
    if (code !== undefined && !['0', '00', '0000'].includes(String(code)))
      fail(
        'Railway API returned an error. Check approval, quota and request conditions.',
      )
    records = response?.body?.items?.item ?? []
    if (!Array.isArray(records) && records && typeof records === 'object')
      records = [records]
    total = response?.body?.totalCount
    page = response?.body?.pageNo
  }
  if (!Array.isArray(records) || !/^\d+$/.test(String(total)))
    fail('Unexpected API schema or missing totalCount; collection stopped.')
  return {
    records,
    total: Number(total),
    page: page === undefined ? undefined : Number(page),
  }
}

export async function collectPages(endpoint, kind, key, date, fetcher = fetch) {
  const records = [],
    seen = new Set()
  let total
  for (let page = 1; page <= 500; page++) {
    const url = new URL(endpoint)
    url.searchParams.set('serviceKey', key)
    url.searchParams.set(kind === 'station' ? 'page' : 'pageNo', String(page))
    url.searchParams.set(kind === 'station' ? 'perPage' : 'numOfRows', '1000')
    if (kind !== 'station') {
      url.searchParams.set('returnType', 'JSON')
    }
    if (kind === 'train') {
      url.searchParams.set('cond[run_ymd::GTE]', date)
      url.searchParams.set('cond[run_ymd::LTE]', date)
    }
    let response
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetcher(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        })
      } catch {
        if (attempt === 2)
          fail(
            'Public-data request failed or timed out. Request URLs and credentials are omitted.',
          )
        continue
      }
      if (
        response.ok ||
        ![429, 500, 502, 503, 504].includes(response.status) ||
        attempt === 2
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
    if (!response.ok)
      fail(
        `Public-data HTTP ${response.status}; check API approval and quota. Credentials are omitted.`,
      )
    let payload
    try {
      payload = await response.json()
    } catch {
      fail(
        'Expected JSON but received another response format; check API approval and parameters.',
      )
    }
    const result = unpackPage(payload, kind)
    if (total === undefined) total = result.total
    if (
      result.total !== total ||
      (result.page !== undefined && result.page !== page)
    )
      fail(
        'Pagination changed during collection; no partial dataset will be published.',
      )
    const signature = createHash('sha256')
      .update(JSON.stringify(result.records))
      .digest('hex')
    if (!result.records.length || seen.has(signature))
      fail(
        'Empty or repeated API page before completion; no partial dataset will be published.',
      )
    seen.add(signature)
    records.push(...result.records)
    if (records.length > total) fail('API returned more rows than totalCount.')
    if (records.length === total) return records
  }
  fail('API exceeded the collection page limit; narrow the data date.')
}

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/역$/, '')
    .replace(/^신경주$/, '경주')
    .replace(/^여수엑스포$/i, '여수EXPO')
    .toLowerCase()
function regionOf(address) {
  if (/^서울/.test(address)) return '서울'
  if (/^(경기|인천)/.test(address)) return '경기'
  if (/^강원/.test(address)) return '강원'
  if (/^(충청|충북|충남|대전|세종)/.test(address)) return '충청'
  if (/^(경상|경북|경남|부산|대구|울산)/.test(address)) return '영남'
  if (/^(전라|전북|전남|광주)/.test(address)) return '호남'
  return '기타'
}

export function transformData(stationRows, planRows, stopRows, date) {
  validateDate(date)
  if (
    !stationRows.length ||
    !stationRows.every((row) => typeof row['역이름'] === 'string')
  )
    fail('Station API schema differs from the configured 역이름 dataset.')
  const stationMap = new Map(),
    ambiguous = new Set()
  let invalidCoordinates = 0
  for (const row of stationRows) {
    const lat = Number(String(row['위도좌표'] ?? '').trim()),
      lng = Number(String(row['경도좌표'] ?? '').trim())
    if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) {
      invalidCoordinates++
      continue
    }
    const name = row['역이름'].trim().replace(/역$/, ''),
      normalized = normalize(name)
    const area = String(row['주소'] ?? '').trim()
    const existing = stationMap.get(normalized)
    if (
      existing &&
      (Math.abs(existing.lat - lat) > 0.01 ||
        Math.abs(existing.lng - lng) > 0.01)
    )
      ambiguous.add(normalized)
    stationMap.set(normalized, {
      id: `station:${normalized}`,
      name,
      lat,
      lng,
      area,
      region: regionOf(area),
      description: String(row['역소개'] ?? '').trim(),
    })
  }
  for (const name of ambiguous) stationMap.delete(name)
  const plans = new Map()
  for (const row of planRows) {
    if (
      String(row.run_ymd) !== date ||
      !row.trn_no ||
      !row.dptre_stn_cd ||
      !row.arvl_stn_cd
    )
      fail('Unexpected plan schema or date; collection stopped.')
    const id = `${date}:${row.trn_no}`
    if (plans.has(id) && JSON.stringify(plans.get(id)) !== JSON.stringify(row))
      fail('Conflicting train plans; collection stopped.')
    plans.set(id, row)
  }
  const groups = new Map()
  for (const row of stopRows) {
    if (
      String(row.run_ymd) !== date ||
      !row.trn_no ||
      !row.stn_cd ||
      !row.stn_nm ||
      !Number.isInteger(Number(row.trn_run_sn)) ||
      Number(row.trn_run_sn) < 1
    )
      fail('Unexpected stop schema or date; collection stopped.')
    const id = `${date}:${row.trn_no}`
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(row)
  }
  const trips = [],
    lines = [],
    lineSignatures = new Map()
  let rejectedTrips = 0
  const excludedTrains = []
  for (const [id, rows] of groups) {
    const sorted = [...rows].sort(
      (a, b) => Number(a.trn_run_sn) - Number(b.trn_run_sn),
    )
    const plan = plans.get(id)
    const full =
      plan &&
      sorted[0].stn_cd === plan.dptre_stn_cd &&
      sorted.at(-1).stn_cd === plan.arvl_stn_cd &&
      sorted[0].stop_se_nm === '시발' &&
      sorted.at(-1).stop_se_nm === '종착' &&
      sorted.every((row, index) => Number(row.trn_run_sn) === index + 1)
    const boarding = sorted.filter((row) =>
      ['시발', '종착', '여객승하차'].includes(row.stop_se_nm),
    )
    if (
      !full ||
      boarding.length < 2 ||
      boarding.some((row) => !stationMap.has(normalize(row.stn_nm)))
    ) {
      rejectedTrips++
      excludedTrains.push({
        trainNumber: String(rows[0].trn_no),
        origin: plan?.dptre_stn_nm ?? sorted[0].stn_nm,
        destination: plan?.arvl_stn_nm ?? sorted.at(-1).stn_nm,
        reason: !full
          ? 'incomplete-sequence-or-endpoints'
          : boarding.length < 2
            ? 'insufficient-passenger-stops'
            : 'station-location-unmatched',
        missingStationNames: [
          ...new Set(
            boarding
              .filter((row) => !stationMap.has(normalize(row.stn_nm)))
              .map((row) => row.stn_nm),
          ),
        ],
      })
      continue
    }
    const stops = boarding.map((row) => ({
      stationId: stationMap.get(normalize(row.stn_nm)).id,
      sequence: Number(row.trn_run_sn),
      arrival: row.trn_arvl_dt ?? null,
      departure: row.trn_dptre_dt ?? null,
    }))
    trips.push({ id, date, trainNumber: String(plan.trn_no), stops })
    const ids = stops.map((stop) => stop.stationId)
    const name = String(sorted[0].mrnt_nm ?? '철도 연결')
    const signature = `${name}:${ids.join('|')}`
    const existingLine = lineSignatures.get(signature)
    if (existingLine) {
      existingLine.trainNumbers.push(String(plan.trn_no))
    } else {
      const hash = createHash('sha256').update(signature).digest('hex')
      const line = {
        id: `route:${hash.slice(0, 16)}`,
        name,
        color:
          colors[
            parseInt(
              createHash('sha256').update(name).digest('hex').slice(0, 6),
              16,
            ) % colors.length
          ],
        stations: ids,
        trainNumbers: [String(plan.trn_no)],
      }
      lines.push(line)
      lineSignatures.set(signature, line)
    }
  }
  if (!stationMap.size || !trips.length)
    fail(
      'No complete trains could be joined to station coordinates. Inspect the public API schema, stop sequence and station names before publishing.',
    )
  const stations = [...stationMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
  const metadata = {
    kind: 'collected',
    dataDate: date,
    generatedAt: new Date().toISOString(),
    stationRows: stationRows.length,
    planRows: planRows.length,
    stopRows: stopRows.length,
    acceptedTrips: trips.length,
    rejectedTrips,
    invalidCoordinates,
    ambiguousStationNames: ambiguous.size,
  }
  const coverage = {
    metadata,
    schema: {
      station: Object.keys(stationRows[0] ?? {}),
      plan: Object.keys(planRows[0] ?? {}),
      stop: Object.keys(stopRows[0] ?? {}),
    },
    stationLocations: stationRows.map((row) => ({
      name: row['역이름'],
      lat: row['위도좌표'],
      lng: row['경도좌표'],
    })),
    excludedTrains,
  }
  return { dataset: { stations, lines, metadata }, trips, coverage }
}

export async function main() {
  let key = process.env.DATA_GO_KR_SERVICE_KEY?.trim()
  if (!key)
    fail(
      'DATA_GO_KR_SERVICE_KEY is missing. Register it as a repository Actions secret.',
    )
  try {
    key = decodeURIComponent(key)
  } catch {
    fail('Service key encoding is invalid. Use the portal Decoding key.')
  }
  const date = validateDate(
    process.env.RAILWAY_DATA_DATE || previousKoreaDate(),
  )
  const stationRows = await collectPages(stationEndpoint, 'station', key, date)
  const planRows = await collectPages(
    `${runEndpoint}/travelerTrainRunPlan2`,
    'train',
    key,
    date,
  )
  const stopRows = await collectPages(
    `${runEndpoint}/travelerTrainRunInfo2`,
    'train',
    key,
    date,
  )
  const { dataset, trips, coverage } = transformData(
    stationRows,
    planRows,
    stopRows,
    date,
  )
  try {
    const codes = await collectPages(`${runEndpoint}/codes2`, 'code', key, date)
    const codeTypes = new Map()
    for (const row of codes) {
      const type = String(row.type ?? 'unknown')
      if (!codeTypes.has(type)) codeTypes.set(type, [])
      if (codeTypes.get(type).length < 8) codeTypes.get(type).push(row)
    }
    coverage.codeTypes = Object.fromEntries(codeTypes)
  } catch (error) {
    coverage.codeStatus =
      error instanceof CollectionError
        ? error.message
        : 'Code metadata unavailable.'
  }
  const root = fileURLToPath(new URL('../', import.meta.url))
  await mkdir(resolve(root, 'src/data/generated'), { recursive: true })
  await mkdir(resolve(root, 'public/data/railway'), { recursive: true })
  await writeFile(
    resolve(root, 'src/data/generated/railway.json'),
    JSON.stringify(dataset),
  )
  await writeFile(
    resolve(root, 'public/data/railway/trips.json'),
    JSON.stringify({ metadata: dataset.metadata, trips }),
  )
  await writeFile(
    resolve(root, 'public/data/railway/coverage.json'),
    JSON.stringify(coverage),
  )
  console.log(
    `Collected ${date}: ${dataset.stations.length} mapped stations, ${trips.length} complete trains; ${dataset.metadata.rejectedTrips} trains excluded.`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    const message =
      error instanceof CollectionError
        ? error.message
        : 'Unexpected collection failure; check the response schema and output directories. Credentials are omitted.'
    console.error(message)
    if (process.env.GITHUB_ACTIONS === 'true') {
      const annotation = message
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A')
      console.error(`::error title=Railway data collection::${annotation}`)
    }
    process.exitCode = 1
  })
}
