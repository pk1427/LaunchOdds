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

export function DiscoverPanel({ onCreate }: { onCreate: (s: UsableStory) => void }) {
  const [sort, setSort] = useState<"rising" | "newest">("rising");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["showhn"],
    queryFn: async () => {
      const ids = await fetchShowStories();
      return fetchUsableStories(ids.slice(0, 80), 40);
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
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">Discover launches</h2>
        <div className="flex gap-1 text-xs">
          {(["rising", "newest"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded px-2 py-1 capitalize ${sort === s ? "bg-monad text-white" : "bg-white/10 text-gray-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <div className="animate-pulse text-gray-400">Loading Show HN…</div>}
      {isError && (
        <div className="text-sm text-no">
          HN fetch failed.{" "}
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}
      <div className="grid max-h-[70vh] gap-2 overflow-y-auto pr-1">
        {stories.map((s) => (
          <div key={s.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <a
              href={`https://news.ycombinator.com/item?id=${s.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-white hover:text-monad"
            >
              {s.title}
            </a>
            <div className="mt-1 font-mono text-xs text-gray-400">
              {s.score} pts · {ageString(s.time, nowSec)} ago · {s.descendants ?? 0} comments ·{" "}
              {pointsPerHour(s, nowSec).toFixed(1)} pts/h · by {s.by}
            </div>
            <button
              onClick={() => onCreate(s)}
              className="mt-2 w-full rounded-lg bg-monad/20 px-2 py-1.5 text-sm font-semibold text-monad hover:bg-monad/30"
            >
              Create market
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
