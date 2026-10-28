import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkStationLocation,
  stationLocation,
} from '../scripts/station-locations.mjs'
import { transformData } from '../scripts/collect-railway-data.mjs'
import { createTimetableIndex, findJourneys } from '../src/lib/timetable.ts'

test('the interchanged Cheongnyangni and Cheoram source coordinates are corrected to their own municipalities', () => {
  const cheongnyangni = stationLocation(
    '청량리',
    37.11298,
    129.036482,
    '서울특별시 동대문구 왕산로 214',
  )
  const cheoram = stationLocation(
    '철암',
    37.579983,
    127.047679,
    '강원도 태백시 동태백로 389',
  )
  assert.ok(cheongnyangni.validation.valid)
  assert.ok(cheoram.validation.valid)
  assert.ok(cheongnyangni.lng > 127 && cheongnyangni.lng < 127.1)
  assert.ok(cheoram.lng > 129 && cheoram.lng < 129.1)
  assert.equal(cheongnyangni.correction?.sourceRow, '철암')
  const upstreamFixed = stationLocation(
    '청량리',
    37.5802,
    127.0468,
    '서울특별시 동대문구 왕산로 214',
  )
  assert.equal(upstreamFixed.lat, 37.5802)
  assert.equal(
    upstreamFixed.correction,
    undefined,
    'Never overwrite an upstream correction with the review registry',
  )
})

test('a Korean coordinate in the wrong municipality is rejected even when the province is correct', () => {
  assert.equal(
    checkStationLocation(37.11298, 129.036482, '서울특별시 동대문구 왕산로 214')
      .valid,
    false,
  )
  assert.equal(
    checkStationLocation(
      35.539412,
      129.355105,
      '울산광역시 울주군 삼남면 울산역로 177',
    ).valid,
    false,
  )
  assert.equal(
    checkStationLocation(
      35.5513,
      129.1382,
      '울산광역시 울주군 삼남읍 울산역로 177',
    ).valid,
    true,
  )
  assert.equal(checkStationLocation(0, 0, '서울특별시 동대문구').valid, false)
  assert.equal(checkStationLocation(37.58, 127.04, '').valid, false)
})

test('municipal mergers and renamed provinces do not discard known good station coordinates', () => {
  assert.ok(
    checkStationLocation(
      36.621521,
      127.328793,
      '충청북도 청주시 흥덕구 오송읍 오송가락로 123',
    ).valid,
  )
  assert.ok(
    checkStationLocation(
      36.6019,
      127.2968,
      '세종특별자치시 조치원읍 으뜸길 215',
    ).valid,
  )
  assert.ok(
    checkStationLocation(36.2348, 128.5729, '대구광역시 군위군 군위읍').valid,
  )
  assert.ok(
    checkStationLocation(
      35.8493,
      127.1618,
      '전북특별자치도 전주시 덕지구 동부대로 680',
    ).valid,
  )
})

test('Seoul to Gangneung retains its complete service stop order while its mapped Cheongnyangni point stays in Seoul', () => {
  const date = '20261027'
  const stations = [
    ['서울', 37.5547, 126.9707, '서울특별시 중구'],
    ['청량리', 37.11298, 129.036482, '서울특별시 동대문구 왕산로 214'],
    ['철암', 37.579983, 127.047679, '강원도 태백시 동태백로 389'],
    ['상봉', 37.5969776, 127.0857994, '서울특별시 중랑구 망우로 297'],
    ['만종', 37.3563988, 127.8969128, '강원도 원주시 호저면 운동들2길 21-33'],
    ['강릉', 37.763401, 128.898856, '강원도 강릉시 용지로 176'],
  ].map(([name, lat, lng, area]) => ({
    역이름: name,
    위도좌표: lat,
    경도좌표: lng,
    주소: area,
  }))
  const names = ['서울', '청량리', '상봉', '만종', '평창', '강릉']
  const times = ['05:06', '05:27', '05:34', '06:16', '06:39', '07:05']
  const stops = names.map((name, i) => ({
    run_ymd: date,
    trn_no: '00801',
    stn_cd: String(i + 1),
    stn_nm: name,
    trn_run_sn: String(i + 1),
    stop_se_nm:
      i === 0 ? '시발' : i === names.length - 1 ? '종착' : '여객승하차',
    trn_arvl_dt: i ? `2026-10-27 ${times[i]}:00` : null,
    trn_dptre_dt: i < names.length - 1 ? `2026-10-27 ${times[i]}:00` : null,
  }))
  const { dataset, trips, coverage } = transformData(
    stations,
    [{ run_ymd: date, trn_no: '00801', dptre_stn_cd: '1', arvl_stn_cd: '6' }],
    stops,
    date,
  )
  assert.equal(coverage.locationCorrections.length, 2)
  const source = dataset.stations.find((station) => station.name === '서울')!
  const corrected = dataset.stations.find(
    (station) => station.name === '청량리',
  )!
  assert.ok(Math.abs(source.lng - corrected.lng) < 0.1)
  assert.ok(Math.abs(source.lat - corrected.lat) < 0.1)
  const [journey] = findJourneys(
    createTimetableIndex(trips),
    source.id,
    'station:강릉',
    { date },
  )
  assert.deepEqual(
    journey.legs[0].stops.map((stop) => stop.name),
    names,
  )
  assert.equal(journey.legs[0].trainNumber, '00801')
  assert.equal(journey.legs[0].stops[4].stationId, 'unmapped:5')
})
