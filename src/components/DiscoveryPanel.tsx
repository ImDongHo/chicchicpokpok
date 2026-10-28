import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Station } from "../types.ts";
import type { TimetableIndex, JourneySearchOptions } from "../lib/timetable.ts";
import type { DestinationRecommendation } from "../lib/recommendations.ts";
import { Icon } from "./Icon.tsx";
import { DestinationCard } from "./DestinationCard.tsx";

interface Props {
  stations: Station[];
  regions: readonly string[];
  date: string;
  initialFrom: string;
  sample: boolean;
  index: TimetableIndex | null;
  loadState: "idle" | "loading" | "ready" | "error";
  error: string;
  onRetry: () => void;
  onPreview: (ids: string[]) => void;
  onSelect: (from: string, to: string, options: JourneySearchOptions) => void;
}

export function DiscoveryPanel({
  stations,
  regions,
  date,
  initialFrom,
  sample,
  index,
  loadState,
  error,
  onRetry,
  onPreview,
  onSelect,
}: Props) {
  const [form, setForm] = useState({
    region:
      stations.find((station) => station.id === initialFrom)?.region ?? "서울",
    from: initialFrom,
    time: "09:00",
    duration: 180,
    transfers: 1,
    roundTrip: true,
  });
  const [results, setResults] = useState<DestinationRecommendation[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const worker = useRef<Worker | null>(null),
    generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const activeStations = useMemo(
    () =>
      stations
        .filter((station) => !index || index.departures.has(station.id))
        .sort(
          (a, b) =>
            (index?.departures.get(b.id)?.length ?? 0) -
              (index?.departures.get(a.id)?.length ?? 0) ||
            a.name.localeCompare(b.name, "ko"),
        ),
    [stations, index],
  );
  const candidates = activeStations.filter(
    (station) => form.region === "전체" || station.region === form.region,
  );
  const from = candidates.some((station) => station.id === form.from)
    ? form.from
    : (candidates[0]?.id ?? "");
  useEffect(() => {
    onPreview(from ? [from] : []);
  }, [from, onPreview]);
  const cancel = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setBusy(false);
  };
  const update = (patch: Partial<typeof form>) => {
    cancel();
    const next = { ...form, ...patch };
    const available = activeStations.filter(
      (station) => next.region === "전체" || station.region === next.region,
    );
    if (!available.some((station) => station.id === next.from))
      next.from = available[0]?.id ?? "";
    setForm(next);
    setResults(null);
    setFailure("");
    onPreview(next.from ? [next.from] : []);
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!index || !from) return;
    cancel();
    setBusy(true);
    setResults(null);
    setFailure("");
    const id = ++generation.current;
    try {
      const current = new Worker(
        new URL("../workers/discovery.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = current;
      timer.current = setTimeout(() => {
        if (generation.current === id) {
          cancel();
          setFailure(
            "추천 계산에 시간이 오래 걸립니다. 이동시간이나 환승 조건을 줄여 다시 시도해 주세요.",
          );
        }
      }, 15000);
      current.onmessage = (
        event: MessageEvent<{
          id: number;
          error?: string;
          results: DestinationRecommendation[];
        }>,
      ) => {
        if (generation.current !== event.data.id) return;
        current.terminate();
        worker.current = null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setBusy(false);
        if (event.data.error) {
          setFailure(event.data.error);
          return;
        }
        setResults(event.data.results);
        onPreview([
          from,
          ...event.data.results.map((result) => result.station.id),
        ]);
      };
      current.onerror = () => {
        if (generation.current !== id) return;
        current.terminate();
        worker.current = null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setBusy(false);
        setFailure("추천을 계산하지 못했습니다. 다시 시도해 주세요.");
      };
      current.postMessage({
        id,
        index,
        stations: stations.map(({ id, name, area, region, lat, lng }) => ({
          id,
          name,
          area,
          region,
          lat,
          lng,
          description: "",
        })),
        from,
        options: {
          date,
          earliestTime: form.time,
          maxDurationMinutes: form.duration,
          maxTransfers: form.transfers,
          minTransferMinutes: 10,
          requireReturn: form.roundTrip,
          minStayMinutes: 120,
          homeBy: "23:00",
          limit: 8,
        },
      });
    } catch {
      cancel();
      setFailure(
        "추천 기능을 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.",
      );
    }
  }
  return (
    <section
      className={`discovery-panel ${results ? "has-results" : ""}`}
      id="discovery-panel"
      role="tabpanel"
      aria-labelledby="discovery-tab"
    >
      <div className="discovery-heading">
        <span className="eyebrow">기차로 만나는 여행지</span>
        <h2>다음 여행은 어디로?</h2>
        <p>
          {sample
            ? "샘플 지도에서는 실제 열차편 추천을 제공하지 않습니다."
            : `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)} 운행 기록 기준 · 최신 예정 시간표가 아닙니다.`}
        </p>
      </div>
      <details className="discovery-filter-panel" open={results === null}>
        <summary>
          <Icon name="route" size={16} />
          출발과 여행 조건
          <small>
            {stations.find((station) => station.id === from)?.name ??
              "출발역 선택"}{" "}
            · {form.duration / 60}시간 이내
          </small>
          <Icon name="chevron" size={16} />
        </summary>
        <form className="discovery-form" onSubmit={submit}>
          <div className="discovery-fields">
            <label>
              출발 지역
              <select
                aria-label="추천 출발 지역"
                value={form.region}
                onChange={(event) => update({ region: event.target.value })}
              >
                {regions.map((region) => (
                  <option key={region}>{region}</option>
                ))}
              </select>
            </label>
            <label>
              출발역
              <select
                aria-label="추천 출발역"
                value={from}
                onChange={(event) => update({ from: event.target.value })}
              >
                {candidates.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}역
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="discovery-fields">
            <label>
              출발 시각 이후
              <input
                aria-label="추천 출발 시각 이후"
                type="time"
                required
                value={form.time}
                onChange={(event) => update({ time: event.target.value })}
              />
            </label>
            <label>
              편도 이동시간
              <select
                aria-label="추천 최대 이동시간"
                value={form.duration}
                onChange={(event) =>
                  update({ duration: Number(event.target.value) })
                }
              >
                <option value={120}>2시간 이내</option>
                <option value={180}>3시간 이내</option>
                <option value={240}>4시간 이내</option>
              </select>
            </label>
          </div>
          <label className="discovery-transfer">
            환승 조건
            <select
              aria-label="추천 환승 조건"
              value={form.transfers}
              onChange={(event) =>
                update({ transfers: Number(event.target.value) })
              }
            >
              <option value={0}>직통만</option>
              <option value={1}>환승 1회까지 · 여유 10분</option>
            </select>
          </label>
          <label className="roundtrip-toggle">
            <input
              type="checkbox"
              checked={form.roundTrip}
              onChange={(event) => update({ roundTrip: event.target.checked })}
            />
            당일 귀가편도 확인<span>현지 2시간 이상 · 23시까지 귀가</span>
          </label>
          <button
            className="primary-button"
            disabled={sample || loadState !== "ready" || !from || busy}
          >
            {busy ? "여행지 찾는 중…" : "갈 수 있는 지역 찾기"}
            <Icon name="arrow" size={16} />
          </button>
        </form>
      </details>
      <div className="discovery-results" aria-live="polite" aria-busy={busy}>
        {loadState === "loading" && (
          <p className="discovery-status">운행 기록을 불러오고 있습니다.</p>
        )}
        {loadState === "error" && (
          <div role="alert">
            <p>{error}</p>
            <button onClick={onRetry}>다시 불러오기</button>
          </div>
        )}
        {failure && <p role="alert">{failure}</p>}
        {busy && (
          <p className="discovery-status">
            실제 열차편과 환승·귀가 조건을 확인하고 있습니다.
          </p>
        )}
        {results && (
          <>
            <p className="discovery-result-count">
              {results.length
                ? `조건에 맞는 ${results.length}개 지역 · 빠른 도착 기준`
                : "조건에 맞는 지역을 확인하지 못했어요. 시간·환승·귀가 조건을 변경해 보세요."}
            </p>
            {results.map((result, order) => (
              <DestinationCard
                key={result.station.id}
                result={result}
                order={order}
                date={date}
                from={from}
                onSelect={onSelect}
              />
            ))}
          </>
        )}
        {!results && !busy && loadState === "ready" && (
          <p className="discovery-status">
            출발 지역과 역을 선택해 주세요. 열차로 도착할 수 있는 지역을 최대
            8곳 추천합니다.
          </p>
        )}
      </div>
    </section>
  );
}
