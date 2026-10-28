/* global window */
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  missingStationLocations,
  selectStationPlace,
  applyStationPlaces,
} from './station-place-match.mjs'
import { normalizeStationName } from './tago.mjs'

class LocationError extends Error {}
const root = fileURLToPath(new URL('../', import.meta.url))
const notice = (title, message) => {
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(
      `::notice title=${title}::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`,
    )
}

async function main() {
  const dataset = JSON.parse(
    await readFile(resolve(root, 'src/data/generated/railway.json'), 'utf8'),
  )
  const payload = JSON.parse(
    await readFile(
      resolve(root, 'public', dataset.metadata.scheduleFile),
      'utf8',
    ),
  )
  const coverage = JSON.parse(
    await readFile(resolve(root, 'public/data/railway/coverage.json'), 'utf8'),
  )
  const needs = missingStationLocations(dataset, payload.trips)
  if (!needs.length) return
  if (needs.length > 200)
    throw new LocationError(
      `More than 200 station location queries are needed (${needs.length}); review the source before proceeding.`,
    )
  const key = process.env.VITE_KAKAO_MAP_APP_KEY?.trim()
  if (!key)
    throw new LocationError(
      'VITE_KAKAO_MAP_APP_KEY is needed for the registered Kakao JavaScript place service.',
    )
  let executablePath
  for (const path of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    try {
      await access(path)
      executablePath = path
      break
    } catch {
      /* Try the next installed browser. */
    }
  }
  if (!executablePath)
    throw new LocationError(
      'A Chrome/Chromium browser is needed to verify station locations with the registered JavaScript SDK.',
    )
  let browser
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      '<!doctype html><html lang="ko"><meta charset="utf-8"><title>Station location verification</title><body>Station location verification</body></html>',
    )
  })
  try {
    await new Promise((resolveReady, reject) => {
      server.once('error', () =>
        reject(
          new LocationError(
            'The registered local station verification port is unavailable.',
          ),
        ),
      )
      server.listen(5173, '127.0.0.1', resolveReady)
    })
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    try {
      await page.goto('http://127.0.0.1:5173/')
      await page.addScriptTag({
        url: `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`,
      })
      const ready = await page.evaluate(
        () =>
          new Promise((resolveReady) => {
            const timer = setTimeout(() => resolveReady(false), 20000)
            window.kakao.maps.load(() => {
              clearTimeout(timer)
              resolveReady(true)
            })
          }),
      )
      if (!ready)
        throw new LocationError('Kakao Maps SDK initialization timed out.')
      await page.waitForFunction(
        () => typeof window.kakao?.maps?.services?.Places === 'function',
        undefined,
        { timeout: 20000 },
      )
    } catch {
      throw new LocationError(
        'Kakao JavaScript place service could not initialize. Check Maps activation and the registered http://127.0.0.1:5173 origin. Credentials omitted.',
      )
    }
    const results = []
    for (const need of needs) {
      const result = await page.evaluate(
        (query) =>
          new Promise((resolveResult) => {
            const timer = setTimeout(
              () => resolveResult({ status: 'TIMEOUT', documents: [] }),
              15000,
            )
            new window.kakao.maps.services.Places().keywordSearch(
              query,
              (rows, status) => {
                clearTimeout(timer)
                resolveResult({
                  status,
                  documents:
                    status === 'OK' && Array.isArray(rows)
                      ? rows
                          .filter((row) => row && typeof row === 'object')
                          .map((row) => ({
                            id: row.id,
                            place_name: row.place_name,
                            category_name: row.category_name,
                            address_name: row.address_name,
                            road_address_name: row.road_address_name,
                            x: row.x,
                            y: row.y,
                          }))
                      : [],
                })
              },
              { size: 15 },
            )
          }),
        need.query,
      )
      if (result.status === 'ERROR' || result.status === 'TIMEOUT')
        throw new LocationError(
          'Kakao station place lookup failed or timed out. Check the application permissions and quota; credentials omitted.',
        )
      const hints = (coverage.rejectedStationLocations ?? [])
        .filter(
          (station) =>
            normalizeStationName(station.name) ===
            normalizeStationName(need.name),
        )
        .map((station) => station.area)
        .filter(Boolean)
      results.push({
        ...need,
        match: selectStationPlace(need.name, result.documents, hints),
        candidates: result.documents
          .slice(0, 3)
          .map(({ place_name, category_name, road_address_name }) => ({
            name: place_name,
            category: category_name,
            address: road_address_name,
          })),
      })
    }
    const added = applyStationPlaces(dataset, results)
    coverage.resolvedStationLocations = added
    coverage.unresolvedStationLocations = results
      .filter((result) => result.match.status !== 'verified')
      .map((result) => ({
        name: result.name,
        status: result.match.status,
        candidates: result.candidates,
      }))
    coverage.mappedStationLocations = dataset.stations.map(
      ({ name, lat, lng, area }) => ({ name, lat, lng, area }),
    )
    coverage.metadata = dataset.metadata
    payload.metadata = dataset.metadata
    await writeFile(
      resolve(root, 'src/data/generated/railway.json'),
      JSON.stringify(dataset),
    )
    await writeFile(
      resolve(root, 'public', dataset.metadata.scheduleFile),
      JSON.stringify(payload),
    )
    await writeFile(
      resolve(root, 'public/data/railway/trips.json'),
      JSON.stringify(payload),
    )
    await writeFile(
      resolve(root, 'public/data/railway/coverage.json'),
      JSON.stringify(coverage),
    )
    notice(
      'Verified station place locations',
      `${added.length} station IDs resolved with ${needs.length} place lookups; ${coverage.unresolvedStationLocations.length} names remain unverified.`,
    )
    notice(
      'Station endpoint locations',
      JSON.stringify(
        added
          .filter((station) =>
            /김천구미|평창|진부|서대구|울산/.test(station.name),
          )
          .map(({ name, lat, lng, area, locationSource }) => ({
            name,
            lat,
            lng,
            area,
            source: locationSource,
          })),
      ),
    )
    if (coverage.unresolvedStationLocations.length)
      notice(
        'Unresolved station place names',
        JSON.stringify(coverage.unresolvedStationLocations),
      )
  } finally {
    await browser?.close()
    await new Promise((resolveClosed) => server.close(resolveClosed))
  }
}

main().catch((error) => {
  const message =
    error instanceof LocationError
      ? error.message
      : 'Station location verification failed; authenticated URLs, upstream errors and credentials are omitted.'
  console.error(message)
  if (process.env.GITHUB_ACTIONS === 'true')
    console.error(`::error title=Station place verification::${message}`)
  process.exitCode = 1
})
