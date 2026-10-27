import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  createTimetableIndex,
  findJourneys,
  parseKoreaTime,
} from '../src/lib/timetable.ts'

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const dataset = JSON.parse(
    await readFile(resolve(root, 'src/data/generated/railway.json'), 'utf8'),
  )
  assert.match(
    dataset.metadata.scheduleFile,
    /^data\/railway\/services-\d{8}-[a-f0-9]+\.json$/,
  )
  const { trips, metadata } = JSON.parse(
    await readFile(
      resolve(root, 'public', dataset.metadata.scheduleFile),
      'utf8',
    ),
  )
  const index = createTimetableIndex(trips)
  const byId = new Map(trips.map((trip) => [trip.id, trip]))
  const date = metadata.dataDate
  const dayOf = (time) =>
    new Date(time + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '')
  const hourOf = (time) =>
    new Date(time + 9 * 3600000).toISOString().slice(11, 16)

  function validateJourney(result, start, end) {
    assert.equal(result.legs[0].stops[0].stationId, start)
    assert.equal(result.legs.at(-1).stops.at(-1).stationId, end)
    for (let i = 0; i < result.legs.length; i++) {
      const leg = result.legs[i],
        source = byId.get(leg.tripId)
      assert.ok(source)
      assert.equal(leg.trainNumber, source.trainNumber)
      const first = source.stops.findIndex(
        (stop) => stop.sequence === leg.stops[0].sequence,
      )
      const last = source.stops.findIndex(
        (stop) => stop.sequence === leg.stops.at(-1).sequence,
      )
      assert.ok(first >= 0 && last > first)
      assert.deepEqual(
        leg.stops,
        source.stops.slice(first, last + 1),
        'A selected service lost or invented an intermediate stop',
      )
      assert.equal(leg.departureAt, parseKoreaTime(leg.stops[0].departure))
      assert.equal(leg.arrivalAt, parseKoreaTime(leg.stops.at(-1).arrival))
      assert.ok(leg.arrivalAt >= leg.departureAt)
      if (i) {
        const previous = result.legs[i - 1]
        assert.equal(previous.stops.at(-1).stationId, leg.stops[0].stationId)
        assert.ok(
          leg.departureAt - previous.arrivalAt >= 10 * 60000,
          'Transfer does not leave the configured minimum time',
        )
        assert.notEqual(previous.tripId, leg.tripId)
      }
    }
  }

  let testedServices = 0
  const skipped = []
  for (const trip of trips) {
    const first = trip.stops[0],
      last = trip.stops.at(-1)
    const departure = parseKoreaTime(first.departure),
      arrival = parseKoreaTime(last.arrival)
    let cursor = departure,
      valid = departure !== null && arrival !== null && arrival >= departure
    for (const stop of trip.stops.slice(1)) {
      for (const value of [stop.arrival, stop.departure]) {
        if (!value) continue
        const time = parseKoreaTime(value)
        if (time === null || time < cursor) valid = false
        else cursor = time
      }
    }
    if (!valid || dayOf(departure) !== date) {
      skipped.push({
        trainNumber: trip.trainNumber,
        reason: 'unverified-service-times',
      })
      continue
    }
    const options = findJourneys(index, first.stationId, last.stationId, {
      date,
      earliestTime: hourOf(departure),
      maxTransfers: 0,
      limit: 50,
    })
    assert.ok(
      options.some((option) => option.legs[0].tripId === trip.id),
      `Train ${trip.trainNumber} missing from direct-service lookup`,
    )
    for (const option of options)
      validateJourney(option, first.stationId, last.stationId)
    testedServices++
  }
  assert.ok(testedServices > 0)

  const pairs = [
    ['동대구', '서울'],
    ['서울', '동대구'],
    ['서울', '강릉'],
    ['강릉', '서울'],
    ['대구', '강릉'],
    ['동대구', '강릉'],
    ['부산', '서울'],
    ['서울', '부산'],
    ['부산', '목포'],
    ['용산', '목포'],
    ['청량리', '안동'],
  ]
  const summarize = (result) => ({
    transfers: result.legs.length - 1,
    legs: result.legs.map((leg) => ({
      trainNumber: leg.trainNumber,
      trainType: leg.trainType,
      departure: leg.stops[0].departure,
      arrival: leg.stops.at(-1).arrival,
      stops: leg.stops.map((stop) => stop.name),
    })),
  })
  const cases = []
  for (const [from, to] of pairs) {
    const start = [...index.stationNames].find(
        ([, name]) => name === from,
      )?.[0],
      end = [...index.stationNames].find(([, name]) => name === to)?.[0]
    if (!start || !end) {
      cases.push({ from, to, status: 'station-not-in-source' })
      continue
    }
    const results = findJourneys(index, start, end, {
      date,
      minTransferMinutes: 10,
    })
    for (const result of results) validateJourney(result, start, end)
    const sourceDirect = trips.some((trip) =>
      trip.stops.some(
        (stop, i) =>
          stop.stationId === start &&
          trip.stops.slice(i + 1).some((next) => next.stationId === end),
      ),
    )
    if (sourceDirect && results.length) assert.equal(results[0].legs.length, 1)
    cases.push({
      from,
      to,
      status: results.length ? 'verified' : 'not-found-in-source-conditions',
      example: results[0] ? summarize(results[0]) : null,
    })
  }

  const directDaegu = []
  for (const trip of trips) {
    const start = trip.stops.findIndex((stop) => stop.name === '동대구'),
      end = trip.stops.findIndex((stop) => stop.name === '서울')
    if (start < 0 || end <= start) continue
    const stops = trip.stops.slice(start, end + 1)
    directDaegu.push({
      trainNumber: trip.trainNumber,
      trainType: trip.trainType,
      departure: stops[0].departure,
      arrival: stops.at(-1).arrival,
      stops: stops.map((stop) => stop.name),
    })
  }
  const report = {
    date,
    testedServices,
    skippedServices: skipped,
    representativeCases: cases,
    osongExamples: {
      stopsAtOsong:
        directDaegu.find((trip) => trip.stops.includes('오송')) ?? null,
      skipsOsong:
        directDaegu.find((trip) => !trip.stops.includes('오송')) ?? null,
    },
    limitations: [
      'Validation is against the collected source records, not live seat availability or future schedule changes.',
      'Missing coordinates do not remove intermediate stops from journeys.',
    ],
  }
  await writeFile(
    resolve(root, 'public/data/railway/validation.json'),
    JSON.stringify(report),
  )
  console.log(
    `Verified ${testedServices}/${trips.length} service stop lists and ${cases.length} representative station pairs; ${skipped.length} services had unverifiable times.`,
  )
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Route validation failed.'
  console.error(message)
  if (process.env.GITHUB_ACTIONS === 'true') {
    const annotation = message
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A')
    console.error(`::error title=Railway route validation::${annotation}`)
  }
  process.exitCode = 1
})
