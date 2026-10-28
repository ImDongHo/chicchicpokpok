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

const PAGE_SIZE = 8;

function DiscoveryPagination({
  page,
  count,
  onChange,
  position,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
  position: string;
}) {
  if (count <= 1) return null;
  return (
    <nav
      className="discovery-pagination"
      aria-label={`추천 지역 페이지 (${position})`}
    >
      <button
        type="button"
        aria-label="이전 지역 보기"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <Icon name="chevron" size={15} className="previous-page-icon" />
      </button>
      <span>
        {page + 1} / {count}
      </span>
      <button
        type="button"
        aria-label="다음 지역 보기"
        disabled={page + 1 >= count}
        onClick={() => onChange(page + 1)}
      >
        <Icon name="chevron" size={15} />
      </button>
    </nav>
  );
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
  const [page, setPage] = useState(0);
  const [destinationQuery, setDestinationQuery] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
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
  const filteredResults = useMemo(() => {
    const query = destinationQuery
      .replace(/\s+/g, "")
      .replace(/역$/, "")
      .toLocaleLowerCase("ko-KR");
    return (results ?? []).filter((result) =>
      [
        result.city,
        result.area,
        result.station.name,
        result.station.region,
      ].some((value) =>
        value.replace(/\s+/g, "").toLocaleLowerCase("ko-KR").includes(query),
      ),
    );
  }, [results, destinationQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleResults = useMemo(
    () =>
      filteredResults.slice(
        currentPage * PAGE_SIZE,
        (currentPage + 1) * PAGE_SIZE,
      ),
    [filteredResults, currentPage],
  );
  useEffect(() => {
    onPreview([
      ...(from ? [from] : []),
      ...visibleResults.map((result) => result.station.id),
    ]);
  }, [from, visibleResults, onPreview]);
  const changePage = (nextPage: number) => {
    setPage(Math.max(0, Math.min(nextPage, pageCount - 1)));
    const panel = panelRef.current,
      target = resultsRef.current;
    if (panel && target)
      panel.scrollTop +=
        target.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  };
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
    setPage(0);
    setDestinationQuery("");
    setFailure("");
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!index || !from) return;
    cancel();
    setBusy(true);
    setResults(null);
    setPage(0);
    setDestinationQuery("");
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
      ref={panelRef}
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
      <div
        ref={resultsRef}
        className="discovery-results"
        aria-live="polite"
        aria-busy={busy}
      >
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
            {results.length > 0 && (
              <div className="discovery-toolbar">
                <div className="search-wrap discovery-city-search">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    aria-label="추천 도착 도시 검색"
                    placeholder="서울 등 도시명"
                    value={destinationQuery}
                    onChange={(event) => {
                      setDestinationQuery(event.target.value);
                      setPage(0);
                    }}
                  />
                  {destinationQuery && (
                    <button
                      type="button"
                      aria-label="도착 도시 검색어 지우기"
                      onClick={() => {
                        setDestinationQuery("");
                        setPage(0);
                      }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <DiscoveryPagination
                  page={currentPage}
                  count={pageCount}
                  onChange={changePage}
                  position="위"
                />
              </div>
            )}
            <p className="discovery-result-count">
              {results.length
                ? `조건에 맞는 총 ${results.length}개 지역${destinationQuery.trim() ? ` · 검색 ${filteredResults.length}개` : ""}`
                : "조건에 맞는 지역을 확인하지 못했어요. 시간·환승·귀가 조건을 변경해 보세요."}
              {filteredResults.length > 0 && (
                <span className="discovery-page-range">
                  {" "}
                  · {currentPage * PAGE_SIZE + 1}–
                  {Math.min(
                    (currentPage + 1) * PAGE_SIZE,
                    filteredResults.length,
                  )}
                  번째 · 빠른 도착 순
                </span>
              )}
            </p>
            {results.length > 0 && filteredResults.length === 0 && (
              <div className="discovery-search-empty">
                <p>
                  “{destinationQuery}”와 일치하는 도시가 없어요. 다른 이름으로
                  찾거나 여행 조건을 변경해 보세요.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDestinationQuery("");
                    setPage(0);
                  }}
                >
                  전체 결과 보기
                </button>
              </div>
            )}
            {visibleResults.map((result, order) => (
              <DestinationCard
                key={result.station.id}
                result={result}
                order={currentPage * PAGE_SIZE + order}
                date={date}
                from={from}
                onSelect={onSelect}
              />
            ))}
            <DiscoveryPagination
              page={currentPage}
              count={pageCount}
              onChange={changePage}
              position="아래"
            />
          </>
        )}
        {!results && !busy && loadState === "ready" && (
          <p className="discovery-status">
            출발 지역과 역을 선택해 주세요. 조건에 맞는 전체 지역을 확인하고
            8곳씩 보여드립니다.
          </p>
        )}
      </div>
    </section>
  );
}
