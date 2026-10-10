"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ageString,
  fetchShowStories,
  fetchUsableStories,
  pointsPerHour,
  type UsableStory,
} from "@/lib/hn";
import { Button } from "./ui";

export function DiscoverPanel({
  onCreate,
  selectedId,
  selectedStory,
  liveScore,
  onContinue,
}: {
  onCreate: (s: UsableStory) => void;
  selectedId?: number;
  selectedStory?: UsableStory | null;
  liveScore?: number;
  onContinue?: () => void;
}) {
  const [sort, setSort] = useState<"rising" | "newest">("rising");
  const [shown, setShown] = useState(6);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["showhn", shown],
    queryFn: async () => {
      const ids = await fetchShowStories();
      return fetchUsableStories(ids.slice(0, shown), shown);
    },
    refetchInterval: 20_000,
    retry: 2,
  });
  const nowSec = Math.floor(Date.now() / 1000);
  const stories = useMemo(() => {
    const list = [...(data ?? [])];
    if (sort === "rising") {
      list.sort((a, b) => pointsPerHour(b, nowSec) - pointsPerHour(a, nowSec));
    } else {
      list.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Choose a story</h3>
        <div className="flex gap-1 text-xs">
          {(["rising", "newest"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className={`rounded px-2 py-1 capitalize ${sort === s ? "bg-monad text-white" : "bg-white/10 text-gray-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {selectedStory ? (
        <div
          aria-live="polite"
          className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-monad/40 bg-monad/10 p-4"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">
              Selected story
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5">
              {selectedStory.title}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="font-mono tabular-nums text-slate-200">
                {liveScore ?? selectedStory.score} points
              </span>
              <span className="mx-1.5 text-slate-600">·</span>
              {ageString(selectedStory.time, nowSec)} ago
            </p>
          </div>
          {onContinue && (
            <Button
              variant="primary"
              onClick={onContinue}
              className="hidden shrink-0 sm:inline-flex"
            >
              Continue
            </Button>
          )}
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Button variant="primary" disabled aria-describedby="choose-story-hint">
            Continue
          </Button>
          <p id="choose-story-hint" className="text-sm text-slate-500">
            Choose a story to continue.
          </p>
        </div>
      )}

      {isLoading && <div className="animate-pulse text-gray-400">Loading Show HN…</div>}
      {isError && (
        <div className="text-sm text-no">
          HN fetch failed.{" "}
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {stories.map((s) => {
          const isSelected = selectedId === s.id;
          return (
            <article
              key={s.id}
              aria-current={isSelected ? "true" : undefined}
              className={`flex min-h-36 flex-col rounded-2xl border p-4 transition ${
                isSelected
                  ? "border-monad bg-monad/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <p className="line-clamp-2 text-sm font-semibold leading-5 text-white">
                {isSelected && (
                  <span aria-hidden="true" className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-monad align-[-2px] text-[10px] font-bold text-white">
                    ✓
                  </span>
                )}
                {s.title}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                <span className="font-mono tabular-nums text-slate-200">
                  {s.score} points
                </span>
                <span className="mx-1.5 text-slate-600">·</span>
                {ageString(s.time, nowSec)} ago
              </p>
              <div className="mt-auto pt-3">
                <button
                  onClick={() => onCreate(s)}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? "Selected: " : "Choose story: "}${s.title ?? `story ${s.id}`}`}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    isSelected
                      ? "bg-monad text-white"
                      : "border border-white/10 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {isSelected ? "Selected" : "Choose story"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {stories.length >= shown && (
        <button
          onClick={() => setShown((n) => n + 6)}
          className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5"
        >
          Show 6 more stories
        </button>
      )}
    </div>
  );
}
