// Hacker News API helpers (no key, CORS-friendly).
// Do NOT trust endpoint ordering — callers sort by `time` themselves.

export interface HnItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  by?: string;
  score?: number;
  time?: number;
  descendants?: number;
  dead?: boolean;
  deleted?: boolean;
}

const BASE = "https://hacker-news.firebaseio.com/v0";

export async function fetchShowStories(): Promise<number[]> {
  const res = await fetch(`${BASE}/showstories.json`);
  if (!res.ok) throw new Error(`showstories failed: ${res.status}`);
  const ids = (await res.json()) as unknown;
  if (!Array.isArray(ids)) throw new Error("showstories: unexpected shape");
  return ids.filter((x): x is number => typeof x === "number");
}

export async function fetchItem(id: number): Promise<HnItem | null> {
  const res = await fetch(`${BASE}/item/${id}.json`);
  if (!res.ok) throw new Error(`item ${id} failed: ${res.status}`);
  return (await res.json()) as HnItem | null;
}

export function isUsableStory(item: HnItem | null | undefined): item is HnItem & {
  score: number;
  time: number;
} {
  return (
    !!item &&
    !item.dead &&
    !item.deleted &&
    item.type === "story" &&
    typeof item.score === "number"
  );
}

export interface UsableStory extends HnItem {
  score: number;
  time: number;
}

export async function fetchUsableStories(
  ids: number[],
  limit = 40,
): Promise<UsableStory[]> {
  const settled = await Promise.allSettled(ids.map((id) => fetchItem(id)));
  const out: UsableStory[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    if (isUsableStory(r.value)) out.push(r.value as UsableStory);
    if (out.length >= limit) break;
  }
  // Newest first by item time (endpoint order is not trusted).
  out.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return out.slice(0, limit);
}

export function pointsPerHour(story: UsableStory, nowSec: number): number {
  const ageH = Math.max((nowSec - (story.time ?? nowSec)) / 3600, 1 / 60);
  return story.score / ageH;
}

export function ageString(time: number | undefined, nowSec: number): string {
  if (!time) return "?";
  const s = Math.max(nowSec - time, 0);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
