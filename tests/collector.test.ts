import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectPages,
  transformData,
  unpackPage,
  validateDate,
  previousKoreaDate,
} from '../scripts/collect-railway-data.mjs'

const date = '20261026'
const stationRows = [
  {
    역이름: '서울',
    위도좌표: '37.5547',
    경도좌표: '126.9707',
    주소: '서울특별시 중구',
    역소개: '서울역',
  },
  {
    역이름: '대전',
    위도좌표: '36.3322',
    경도좌표: '127.4341',
    주소: '대전광역시 동구',
  },
  {
    역이름: '부산',
    위도좌표: '35.1153',
    경도좌표: '129.0416',
    주소: '부산광역시 동구',
  },
]
const plans = [
  { run_ymd: date, trn_no: '00001', dptre_stn_cd: 'S', arvl_stn_cd: 'B' },
]
const stops = [
  {
    run_ymd: date,
    trn_no: '00001',
    stn_cd: 'S',
    stn_nm: '서울',
    trn_run_sn: '1',
    stop_se_nm: '시발',
    mrnt_nm: '경부선',
    trn_dptre_dt: '2026-10-26 05:13:00.0',
  },
  {
    run_ymd: date,
    trn_no: '00001',
    stn_cd: 'D',
    stn_nm: '대전',
    trn_run_sn: '2',
    stop_se_nm: '여객승하차',
    mrnt_nm: '경부선',
  },
  {
    run_ymd: date,
    trn_no: '00001',
    stn_cd: 'B',
    stn_nm: '부산',
    trn_run_sn: '3',
    stop_se_nm: '종착',
    mrnt_nm: '경부선',
    trn_arvl_dt: '2026-10-26 07:50:00.0',
  },
]

test('collection retains every train number when services share the same station sequence', () => {
  const morePlans = [...plans, { ...plans[0], trn_no: '00003' }]
  const moreStops = [
    ...stops,
    ...stops.map((stop) => ({ ...stop, trn_no: '00003' })),
  ]
  const { dataset, trips } = transformData(
    stationRows,
    morePlans,
    moreStops,
    date,
  )
  assert.equal(trips.length, 2)
  assert.equal(dataset.lines.length, 1)
  assert.deepEqual(dataset.lines[0].trainNumbers, ['00001', '00003'])
})

test('API response adapters understand both documented envelopes and reject application errors', () => {
  assert.equal(
    unpackPage({ data: stationRows, totalCount: 3, page: 1 }, 'station').total,
    3,
  )
  assert.deepEqual(
    unpackPage(
      {
        response: {
          header: { resultCode: '00' },
          body: { totalCount: '1', items: { item: stops[0] } },
        },
      },
      'train',
    ).records,
    [stops[0]],
  )
  assert.throws(
    () => unpackPage({ response: { header: { resultCode: '30' } } }, 'train'),
    /API returned an error/,
  )
  assert.throws(() => unpackPage({ data: [] }, 'station'), /schema/)
})

test('pagination reads the declared total and transmits only the exact date condition', async () => {
  const urls: URL[] = []
  const rows = await collectPages(
    'https://api.odcloud.kr/api/example',
    'station',
    'fixture-only',
    date,
    async (url: URL) => {
      urls.push(url)
      const page = Number(url.searchParams.get('page'))
      return {
        ok: true,
        json: async () => ({
          page,
          totalCount: 3,
          data: page === 1 ? ['a', 'b'] : ['c'],
        }),
      }
    },
  )
  assert.deepEqual(rows, ['a', 'b', 'c'])
  assert.equal(urls.length, 2)
  assert.equal(urls[0].searchParams.get('serviceKey'), 'fixture-only')
  await collectPages(
    'https://apis.data.go.kr/example',
    'train',
    'fixture-only',
    date,
    async (url: URL) => {
      assert.equal(url.searchParams.get('cond[run_ymd::GTE]'), date)
      assert.equal(url.searchParams.get('cond[run_ymd::LTE]'), date)
      assert.equal(url.searchParams.has('cond[stn_cd::EQ]'), false)
      return {
        ok: true,
        json: async () => ({
          response: { body: { totalCount: 1, items: { item: stops[0] } } },
        }),
      }
    },
  )
})

test('repeated, changed, empty and overfull pages cannot produce a successful snapshot', async () => {
  const response = (data: unknown[], totalCount: number, page?: number) => ({
    ok: true,
    json: async () => ({ data, totalCount, page }),
  })
  await assert.rejects(
    collectPages(
      'https://api.odcloud.kr/example',
      'station',
      'fixture-only',
      date,
      async () => response(['a'], 2),
    ),
    /repeated/,
  )
  await assert.rejects(
    collectPages(
      'https://api.odcloud.kr/example',
      'station',
      'fixture-only',
      date,
      async () => response([], 0),
    ),
    /Empty/,
  )
  await assert.rejects(
    collectPages(
      'https://api.odcloud.kr/example',
      'station',
      'fixture-only',
      date,
      async () => response(['a', 'b'], 1),
    ),
    /more rows/,
  )
  await assert.rejects(
    collectPages(
      'https://api.odcloud.kr/example',
      'station',
      'fixture-only',
      date,
      async () => response(['a'], 1, 2),
    ),
    /Pagination changed/,
  )
})

test('HTTP and network errors do not leak the service key or authenticated URL', async () => {
  const key = 'fixture-only-do-not-log'
  await assert.rejects(
    collectPages(
      'https://api.odcloud.kr/example',
      'station',
      key,
      date,
      async () => ({ ok: false, status: 403 }),
    ),
    (error) =>
      error instanceof Error &&
      error.message.includes('403') &&
      !error.message.includes(key),
  )
  await assert.rejects(
    collectPages(
      'https://api.odcloud.kr/example',
      'station',
      key,
      date,
      async () => {
        throw new Error(key)
      },
    ),
    (error) => error instanceof Error && !error.message.includes(key),
  )
})

test('complete trains retain all stops even when station coordinates are unavailable', () => {
  const { dataset, trips } = transformData(
    stationRows,
    plans,
    [...stops].reverse(),
    date,
  )
  assert.equal(dataset.metadata.acceptedTrips, 1)
  assert.deepEqual(dataset.lines[0].stations, [
    'station:서울',
    'station:대전',
    'station:부산',
  ])
  assert.equal(trips[0].stops[0].departure, '2026-10-26 05:13:00.0')
  assert.equal(
    dataset.stations.find((station) => station.name === '대전')?.region,
    '충청',
  )
  assert.throws(
    () => transformData(stationRows, plans, [stops[0], stops[2]], date),
    /No complete trains/,
  )
  const withUnknownLocation = transformData(
    stationRows.slice(0, 2),
    plans,
    stops,
    date,
  )
  assert.equal(withUnknownLocation.trips.length, 1)
  assert.deepEqual(
    withUnknownLocation.trips[0].stops.map((stop) => stop.name),
    ['서울', '대전', '부산'],
  )
  assert.equal(
    withUnknownLocation.trips[0].stops.at(-1).stationId,
    'unmapped:B',
  )
  assert.equal(withUnknownLocation.dataset.stations.length, 2)
  assert.equal(withUnknownLocation.dataset.metadata.tripsWithUnmappedStops, 1)
  assert.throws(
    () => transformData(stationRows, plans, [...stops, stops[1]], date),
    /No complete trains/,
  )
})

test('bad dates, changed schemas, and ambiguous station coordinates stop or exclude unsafe data', () => {
  assert.throws(() => validateDate('20260230'), /Invalid/)
  assert.equal(previousKoreaDate(new Date('2026-10-26T16:00:00Z')), '20261026')
  assert.throws(
    () => transformData([{ name: '서울' }], plans, stops, date),
    /schema/,
  )
  const ambiguousLocation = transformData(
    [...stationRows, { ...stationRows[0], 위도좌표: '36.0' }],
    plans,
    stops,
    date,
  )
  assert.equal(ambiguousLocation.dataset.metadata.ambiguousStationNames, 1)
  assert.ok(
    !ambiguousLocation.dataset.stations.some(
      (station) => station.name === '서울',
    ),
  )
  assert.equal(ambiguousLocation.trips[0].stops[0].stationId, 'unmapped:S')
  assert.throws(
    () => transformData(stationRows, plans, stops, '20261027'),
    /schema or date/,
  )
})
