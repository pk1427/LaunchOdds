// tsx script: watch HN story scores to pick a climbing demo story.
// Usage: tsx scripts/watch-score.ts <storyId> [storyId...]
// Polls every 30s for ~5 min, prints score, delta, and points/hour.
interface Item {
  id: number;
  title?: string;
  score?: number;
  time?: number;
}

async function fetchItem(id: number): Promise<Item | null> {
  const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  if (!res.ok) throw new Error(`item ${id}: HTTP ${res.status}`);
  return (await res.json()) as Item | null;
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    console.error("Usage: tsx scripts/watch-score.ts <storyId> [storyId...]");
    process.exit(1);
  }
  const startScores = new Map<number, number>();
  const t0 = Date.now();
  for (let round = 0; round < 10; round++) {
    const now = Date.now();
    const elapsedH = Math.max((now - t0) / 3_600_000, 1 / 120);
    for (const id of ids) {
      try {
        const item = await fetchItem(id);
        const score = item?.score ?? NaN;
        if (!startScores.has(id) && Number.isFinite(score)) startScores.set(id, score);
        const s0 = startScores.get(id);
        const delta = s0 === undefined ? "n/a" : `${score - s0 >= 0 ? "+" : ""}${score - s0}`;
        const pph = s0 === undefined ? "n/a" : ((score - s0) / elapsedH).toFixed(2);
        console.log(
          `[+${Math.round((now - t0) / 1000)}s] #${id} "${(item?.title ?? "?").slice(0, 60)}" score=${score} delta=${delta} pts/h=${pph}`,
        );
      } catch (e) {
        console.log(`[+${Math.round((now - t0) / 1000)}s] #${id} error: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (round < 9) await new Promise((r) => setTimeout(r, 30_000));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
