import test from "node:test";
import assert from "node:assert/strict";
import type { Station, TrainTrip } from "../src/types.ts";
import {
  createTimetableIndex,
  findJourneys,
  parseKoreaTime,
} from "../src/lib/timetable.ts";
import {
  recommendDestinations,
  stationCity,
} from "../src/lib/recommendations.ts";
import { bookingLinks } from "../src/lib/booking.ts";

const date = "20261026";
function trip(
  number: string,
  stops: [string, string][],
  trainType: string | null = "KTX",
): TrainTrip {
  return {
    id: number,
    date,
    trainNumber: number,
    trainType,
    stops: stops.map(([stationId, time], index) => ({
      stationId,
      name: stationId,
      sequence: index + 1,
      arrival: index ? `2026-10-26 ${time}:00` : null,
      departure: index < stops.length - 1 ? `2026-10-26 ${time}:00` : null,
    })),
  };
}
function station(id: string, area: string, region = "충청"): Station {
  return { id, name: id, area, region, lat: 36.4, lng: 127.4, description: "" };
}
const stations = [
  station("서울", "서울특별시 중구", "서울"),
  station("용산", "서울 용산구", "서울"),
  station("대전", "대전광역시 동구"),
  station("서대전", "대전 중구"),
  station("아산", "충남 아산시"),
  station("광명", "경기 광명시", "경기"),
];
const discovery = {
  date,
  earliestTime: "09:00",
  maxDurationMinutes: 180,
  maxTransfers: 1,
  minTransferMinutes: 10,
  requireReturn: true,
};

test("arrival preference can beat a direct train and a one-change train with two changes", () => {
  const index = createTimetableIndex([
    trip("direct", [
      ["a", "08:00"],
      ["b", "12:00"],
    ]),
    trip("first", [
      ["a", "08:00"],
      ["x", "08:20"],
    ]),
    trip("one-change", [
      ["x", "08:30"],
      ["b", "10:00"],
    ]),
    trip("second", [
      ["x", "08:30"],
      ["y", "08:50"],
    ]),
    trip("third", [
      ["y", "09:00"],
      ["b", "09:20"],
    ]),
  ]);
  assert.equal(
    findJourneys(index, "a", "b", { date })[0].legs[0].trainNumber,
    "direct",
  );
  const fast = findJourneys(index, "a", "b", {
    date,
    preference: "fastest",
  })[0];
  assert.deepEqual(
    fast.legs.map((leg) => leg.trainNumber),
    ["first", "second", "third"],
  );
  assert.equal(
    findJourneys(index, "a", "b", {
      date,
      preference: "fastest",
      maxTransfers: 1,
    })[0].legs.length,
    2,
  );
  assert.equal(
    findJourneys(index, "x", "b", { date, preference: "fewest-transfers" })[0]
      .legs.length,
    1,
  );
});

test("duration filtering preserves a later origin departure and includes transfer waiting", () => {
  const index = createTimetableIndex([
    trip("too-early", [
      ["a", "08:00"],
      ["x", "08:30"],
    ]),
    trip("later", [
      ["a", "09:00"],
      ["x", "09:30"],
    ]),
    trip("connection", [
      ["x", "10:00"],
      ["b", "10:30"],
    ]),
  ]);
  const [result] = findJourneys(index, "a", "b", {
    date,
    maxDurationMinutes: 90,
    preference: "fastest",
  });
  assert.equal(result.legs[0].trainNumber, "later");
  assert.equal(result.arrivalAt - result.departureAt, 90 * 60000);
  assert.deepEqual(
    findJourneys(index, "a", "b", { date, maxDurationMinutes: 89 }),
    [],
  );
  assert.deepEqual(
    findJourneys(index, "a", "b", { date, latestArrivalTime: "10:29" }),
    [],
  );
  assert.equal(
    findJourneys(index, "a", "b", { date, latestArrivalTime: "10:30" }).length,
    1,
  );
});

test("recommendations deduplicate cities, exclude the origin city and require real same-day returns", () => {
  const index = createTimetableIndex([
    trip("out", [
      ["서울", "09:00"],
      ["용산", "09:10"],
      ["광명", "09:20"],
      ["대전", "10:00"],
    ]),
    trip("other-daejeon", [
      ["서울", "09:10"],
      ["서대전", "10:20"],
    ]),
    trip("too-short-stay", [
      ["대전", "11:59"],
      ["서울", "12:59"],
    ]),
    trip("home", [
      ["대전", "12:00"],
      ["서울", "13:00"],
    ]),
    trip("other-home", [
      ["서대전", "13:00"],
      ["서울", "14:00"],
    ]),
    trip("no-home", [
      ["서울", "09:20"],
      ["아산", "10:10"],
    ]),
    trip("wrong-home-station", [
      ["광명", "13:00"],
      ["용산", "13:30"],
    ]),
  ]);
  const results = recommendDestinations(index, stations, "서울", discovery);
  assert.deepEqual(
    results.map((result) => result.city),
    ["대전"],
  );
  assert.equal(results[0].returning!.legs[0].trainNumber, "home");
  assert.equal(
    results[0].returning!.legs.at(-1)!.stops.at(-1)!.stationId,
    "서울",
  );
  assert.equal(
    results[0].returning!.departureAt - results[0].outbound.arrivalAt,
    120 * 60000,
  );
  assert.equal(
    results[0].outbound.id,
    findJourneys(index, "서울", "대전", results[0].searchOptions)[0].id,
  );
  assert.equal(
    results[0].returning!.id,
    findJourneys(index, "대전", "서울", results[0].returnOptions!)[0].id,
  );
  const oneWay = recommendDestinations(index, stations, "서울", {
    ...discovery,
    requireReturn: false,
  });
  assert.deepEqual(
    oneWay.map((result) => result.city),
    ["광명", "대전", "아산"],
  );
  assert.ok(
    oneWay.every(
      (result) => result.returning === null && result.returnOptions === null,
    ),
  );
});

test("a return after 23:00 or the next day is not a day-trip recommendation", () => {
  const late = trip("late", [
    ["대전", "22:30"],
    ["서울", "23:01"],
  ]);
  const overnight = trip("overnight", [
    ["대전", "22:40"],
    ["서울", "23:59"],
  ]);
  overnight.stops[1].arrival = "2026-10-27 00:01:00";
  const index = createTimetableIndex([
    trip("out", [
      ["서울", "09:00"],
      ["대전", "10:00"],
    ]),
    late,
    overnight,
  ]);
  assert.deepEqual(
    recommendDestinations(index, stations, "서울", discovery),
    [],
  );
  assert.equal(
    recommendDestinations(index, stations, "서울", {
      ...discovery,
      requireReturn: false,
    }).length,
    1,
  );
});

test("recommendation time caps, transfer caps and a maximum of eight cards are enforced", () => {
  const nearby = Array.from({ length: 10 }, (_, i) =>
    station(`역${i}`, `충남 도시${i}시`),
  );
  const index = createTimetableIndex([
    ...nearby.map((s, i) =>
      trip(`out${i}`, [
        ["서울", "09:00"],
        [s.id, `10:${String(i).padStart(2, "0")}`],
      ]),
    ),
    trip("one", [
      ["서울", "09:00"],
      ["환승", "09:40"],
    ]),
    trip("two", [
      ["환승", "09:50"],
      ["대전", "10:20"],
    ]),
  ]);
  const all = [stations[0], stations[2], ...nearby];
  const options = { ...discovery, requireReturn: false };
  assert.equal(recommendDestinations(index, all, "서울", options).length, 8);
  assert.equal(
    recommendDestinations(index, all, "서울", { ...options, limit: 12 }).length,
    11,
  );
  assert.equal(
    recommendDestinations(index, all, "서울", {
      ...options,
      maxTransfers: 0,
      limit: 12,
    }).length,
    10,
  );
  assert.deepEqual(
    recommendDestinations(index, all, "서울", {
      ...options,
      maxDurationMinutes: 59,
    }),
    [],
  );
  assert.deepEqual(
    recommendDestinations(index, all, "대전", options),
    [],
    "Never invent reverse services",
  );
});

test("city grouping accepts abbreviated provinces and distinguishes counties from metro districts", () => {
  assert.equal(
    stationCity(station("a", "경상북도 김천시", "영남")).key,
    stationCity(station("b", "경북 김천시", "영남")).key,
  );
  assert.equal(stationCity(stations[0]).key, stationCity(stations[1]).key);
  assert.equal(
    stationCity(station("a", "대구광역시 군위군", "영남")).name,
    "군위",
  );
});

test("booking links use official HTTPS roots, match known operators and never forward historical dates", () => {
  const index = createTimetableIndex([
    trip(
      "a",
      [
        ["서울", "09:00"],
        ["대전", "10:00"],
      ],
      "KTX-이음",
    ),
    trip(
      "b",
      [
        ["대전", "10:20"],
        ["부산", "11:00"],
      ],
      "SRT",
    ),
    trip(
      "unknown",
      [
        ["서울", "12:00"],
        ["대전", "13:00"],
      ],
      null,
    ),
  ]);
  const direct = findJourneys(index, "서울", "대전", { date });
  assert.deepEqual(
    bookingLinks(direct[0]).map((link) => link.id),
    ["korail"],
  );
  assert.deepEqual(
    bookingLinks(direct[1]).map((link) => link.id),
    ["korail", "srt"],
  );
  const mixed = findJourneys(index, "서울", "부산", { date })[0];
  assert.deepEqual(
    bookingLinks(mixed).map((link) => link.id),
    ["korail", "srt"],
  );
  for (const link of bookingLinks(mixed)) {
    const url = new URL(link.url);
    assert.equal(url.protocol, "https:");
    assert.ok(["www.letskorail.com", "etk.srail.kr"].includes(url.hostname));
    assert.equal(url.search, "");
  }
  assert.ok(mixed.departureAt >= parseKoreaTime("2026-10-26 00:00:00")!);
});
