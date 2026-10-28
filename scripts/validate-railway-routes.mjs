import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { checkStationLocation } from './station-locations.mjs'
import {
  createTimetableIndex,
  findJourneys,
  parseKoreaTime,
  journeyStops,
} from '../src/lib/timetable.ts'
import {
  buildJourneySegments,
  buildSegmentedMapPaths,
} from '../src/lib/route-segments.ts'
import { recommendDestinations } from '../src/lib/recommendations.ts'

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
  for (const station of dataset.stations) {
    assert.ok(
      checkStationLocation(station.lat, station.lng, station.area).valid,
      `Mapped station ${station.name} conflicts with its source address`,
    )
  }
  const byId = new Map(trips.map((trip) => [trip.id, trip]))
  const date = metadata.dataDate
  let tagoVerifiedServices = 0
  if (dataset.metadata.tagoMatchedTrips) {
    const snapshot = JSON.parse(
      await readFile(resolve(root, 'public/data/railway/tago.json'), 'utf8'),
    )
    assert.equal(snapshot.metadata.dataDate, date)
    const keyOf = (record) =>
      [
        Number(record.trainNumber),
        record.from,
        record.to,
        parseKoreaTime(record.departure),
        parseKoreaTime(record.arrival),
        record.trainType,
      ].join('|')
    const official = new Set(snapshot.services.map(keyOf))
    for (const trip of trips) {
      const proof = trip.timetableVerified
      if (!proof) continue
      const last = trip.stops.findLast(
        (stop) => stop.stationId !== trip.stops[0].stationId,
      )
      assert.equal(proof.source, 'TAGO')
      assert.equal(proof.date, date)
      assert.equal(
        parseKoreaTime(proof.departure),
        parseKoreaTime(
          proof.timingBasis === 'planned'
            ? trip.plannedDeparture
            : trip.stops[0].departure,
        ),
      )
      assert.equal(
        parseKoreaTime(proof.arrival),
        parseKoreaTime(
          proof.timingBasis === 'planned' ? trip.plannedArrival : last.arrival,
        ),
      )
      assert.ok(
        official.has(
          keyOf({
            ...proof,
            trainNumber: trip.trainNumber,
            trainType: trip.trainType,
          }),
        ),
        `Train ${trip.trainNumber} has no matching official TAGO record`,
      )
      tagoVerifiedServices++
    }
    assert.equal(tagoVerifiedServices, dataset.metadata.tagoMatchedTrips)
  }
  const dayOf = (time) =>
    new Date(time + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '')
  const hourOf = (time) =>
    new Date(time + 9 * 3600000).toISOString().slice(11, 16)
  const knownMapIds = new Set(dataset.stations.map((station) => station.id))
  let mapConnectionsChecked = 0

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
    const orderedKnown = journeyStops(result)
      .map((stop) => stop.stationId)
      .filter((id) => knownMapIds.has(id))
    const paths = buildSegmentedMapPaths(
      buildJourneySegments(result, date),
      knownMapIds,
    )
    const edges = new Set(
      paths.flatMap((path) =>
        path.stationIds
          .slice(1)
          .map((id, i) => JSON.stringify([path.stationIds[i], id])),
      ),
    )
    for (let i = 1; i < orderedKnown.length; i++) {
      if (orderedKnown[i - 1] === orderedKnown[i]) continue
      assert.ok(
        edges.has(JSON.stringify([orderedKnown[i - 1], orderedKnown[i]])),
        `Map route stopped before ${orderedKnown[i]} because of a missing intermediate location`,
      )
    }
    assert.ok(
      paths.every((path) => path.stationIds.every((id) => knownMapIds.has(id))),
      'Map geometry invented a station location',
    )
    mapConnectionsChecked++
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
    // Round trips need two distinct-station queries to cover the entire record.
    const sections = [[first, last]]
    if (first.stationId === last.stationId) {
      const middle = trip.stops
        .slice(1, -1)
        .findLast(
          (stop) =>
            stop.stationId !== first.stationId &&
            parseKoreaTime(stop.arrival) !== null &&
            parseKoreaTime(stop.departure) !== null,
        )
      assert.ok(
        middle,
        `Train ${trip.trainNumber} has no verifiable distinct-station section`,
      )
      sections.splice(0, 1, [first, middle], [middle, last])
    }
    for (const [from, to] of sections) {
      const begins = parseKoreaTime(from.departure)
      const options = findJourneys(index, from.stationId, to.stationId, {
        date: dayOf(begins),
        earliestTime: hourOf(begins),
        maxTransfers: 0,
        limit: 50,
      })
      assert.ok(
        options.some(
          (option) =>
            option.legs[0].tripId === trip.id &&
            option.legs[0].stops[0].sequence === from.sequence &&
            option.legs[0].stops.at(-1).sequence === to.sequence,
        ),
        `Train ${trip.trainNumber} missing from direct-service lookup (${from.name} -> ${to.name})`,
      )
      for (const option of options)
        validateJourney(option, from.stationId, to.stationId)
    }
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
  const discoveryOrigin = dataset.stations.find(
    (station) => station.name === '동대구',
  )
  const seoulStation = dataset.stations.find(
    (station) => station.name === '서울',
  )
  const discoveryCriteria = {
    date,
    earliestTime: '09:00',
    maxDurationMinutes: 240,
    maxTransfers: 0,
    minTransferMinutes: 10,
    requireReturn: true,
    minStayMinutes: 120,
    homeBy: '23:00',
  }
  const destinations = discoveryOrigin
    ? recommendDestinations(
        index,
        dataset.stations,
        discoveryOrigin.id,
        discoveryCriteria,
      )
    : []
  for (const destination of destinations) {
    validateJourney(
      destination.outbound,
      discoveryOrigin.id,
      destination.station.id,
    )
    validateJourney(
      destination.returning,
      destination.station.id,
      discoveryOrigin.id,
    )
    assert.ok(
      destination.outbound.arrivalAt - destination.outbound.departureAt <=
        240 * 60000,
    )
    assert.ok(
      destination.returning.arrivalAt - destination.returning.departureAt <=
        240 * 60000,
    )
    assert.ok(
      destination.returning.departureAt - destination.outbound.arrivalAt >=
        120 * 60000,
    )
    assert.equal(dayOf(destination.returning.arrivalAt), date)
    assert.ok(hourOf(destination.returning.arrivalAt) <= '23:00')
  }
  const seoulCity = destinations.find(
    (destination) => destination.city === '서울',
  )
  let seoulStationExample = null
  if (discoveryOrigin && seoulStation) {
    const direct = findJourneys(index, discoveryOrigin.id, seoulStation.id, {
      ...discoveryCriteria,
      latestArrivalTime: '23:00',
      preference: 'fastest',
    })
    for (const outbound of direct) {
      const afterStay =
        Math.ceil((outbound.arrivalAt + 120 * 60000) / 60000) * 60000
      if (dayOf(afterStay) !== date) continue
      const returning = findJourneys(
        index,
        seoulStation.id,
        discoveryOrigin.id,
        {
          ...discoveryCriteria,
          earliestTime: hourOf(afterStay),
          latestArrivalTime: '23:00',
          preference: 'fastest',
          limit: 1,
        },
      )[0]
      if (!returning) continue
      validateJourney(outbound, discoveryOrigin.id, seoulStation.id)
      validateJourney(returning, seoulStation.id, discoveryOrigin.id)
      seoulStationExample = {
        outbound: summarize(outbound),
        returning: summarize(returning),
      }
      assert.ok(
        seoulCity,
        'An eligible Seoul round trip was lost from the complete destination results',
      )
      break
    }
  }
  const discoveryExample = {
    from: discoveryOrigin?.name ?? null,
    criteria: discoveryCriteria,
    eligibleCities: destinations.length,
    seoulCityRank: seoulCity ? destinations.indexOf(seoulCity) + 1 : null,
    seoulCityStation: seoulCity?.station.name ?? null,
    seoulStationExample,
  }
  const report = {
    date,
    validatedMapLocations: dataset.stations.length,
    mapConnectionsChecked,
    tagoVerifiedServices,
    testedServices,
    skippedServices: skipped,
    representativeCases: cases,
    discoveryExample,
    osongExamples: {
      stopsAtOsong:
        directDaegu.find((trip) => trip.stops.includes('오송')) ?? null,
      skipsOsong:
        directDaegu.find((trip) => !trip.stops.includes('오송')) ?? null,
    },
    limitations: [
      'Validation is against the collected source records, not live seat availability or future schedule changes.',
      'Missing coordinates do not remove intermediate stops from journeys.',
      'Light dotted links bridge missing intermediate locations without estimating a marker or exact railway geometry.',
    ],
  }
  await writeFile(
    resolve(root, 'public/data/railway/validation.json'),
    JSON.stringify(report),
  )
  console.log(
    `Verified ${testedServices}/${trips.length} service stop lists and ${cases.length} representative station pairs; ${skipped.length} services had unverifiable times.`,
  )
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(
      `::notice title=Map connection validation::${mapConnectionsChecked} journey map connections checked; every consecutive known station remains linked, including gaps at missing intermediate or transfer locations.`,
    )
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(
      `::notice title=Destination eligibility validation::${JSON.stringify(discoveryExample).replaceAll('%', '%25')}`,
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
