"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { decodeEventLog, keccak256, toHex, type Address } from "viem";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { RequireWallet } from "@/components/RequireWallet";
import { Button, GlassCard, Pill } from "@/components/ui";
import { useToasts } from "@/components/Toasts";
import { localTime } from "@/lib/format";
import { useStory } from "@/lib/hooks";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { fetchItem, isUsableStory, type UsableStory } from "@/lib/hn";
import { buildMetadataHash, buildQuestion, type MarketMetadata } from "@/lib/metadata";

const TARGETS = [1, 2, 3, 5, 10];
const DEADLINES = [
  { label: "3m", secs: 180 },
  { label: "5m", secs: 300 },
  { label: "10m", secs: 600 },
  { label: "30m", secs: 1800 },
  { label: "1h", secs: 3600 },
];
const MARKET_CREATED_TOPIC = keccak256(
  toHex("MarketCreated(uint256,address,uint256,uint256,uint256,uint64,bytes32)"),
);

function useMomentum(storyId: number, score: number | undefined) {
  const snaps = useRef<{ t: number; s: number }[]>([]);
  const [lastId, setLastId] = useState(storyId);
  const [, setTick] = useState(0);
  if (lastId !== storyId) {
    setLastId(storyId);
    snaps.current = [];
  }
  useEffect(() => {
    if (score === undefined) return;
    const now = Date.now();
    const arr = snaps.current.filter((p) => now - p.t <= 30 * 60 * 1000);
    const last = arr[arr.length - 1];
    if (!last || last.s !== score) {
      arr.push({ t: now, s: score });
      snaps.current = arr.slice(-24);
      setTick((x) => x + 1);
    }
  }, [storyId, score]);
  const arr = snaps.current;
  if (arr.length < 2) return { ready: false as const, points: arr };
  const first = arr[0];
  const last = arr[arr.length - 1];
  return {
    ready: true as const,
    points: arr,
    delta: last.s - first.s,
    minutes: Math.max((last.t - first.t) / 60000, 0.5),
  };
}

function Sparkline({ points }: { points: { t: number; s: number }[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.s));
  const max = Math.max(...points.map((p) => p.s));
  const span = Math.max(max - min, 1);
  const coords = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p.s - min) / span) * 26}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" className="h-7 w-28" aria-hidden>
      <polyline points={coords} fill="none" stroke="#836EF9" strokeWidth="2" />
    </svg>
  );
}

export default function CreatePage() {
  return (
    <RequireWallet reason="Only connected wallets on Monad Testnet can create markets.">
      <CreateWizard />
    </RequireWallet>
  );
}

function CreateWizard() {
  const router = useRouter();
  const { push, update } = useToasts();
  const [selected, setSelected] = useState<UsableStory | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [delta, setDelta] = useState(5);
  const [deadline, setDeadline] = useState(300);
  const [busy, setBusy] = useState(false);
  const toastRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const { data: live } = useStory(selected?.id ?? null);
  const liveScore = live?.score ?? selected?.score;
  const target = (liveScore ?? 0) + delta;
  const momentum = useMomentum(selected?.id ?? 0, liveScore);

  const publicClient = usePublicClient({ chainId: APP_CHAIN_ID });
  const { writeContract, data: hash } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: APP_CHAIN_ID });

  const meta: MarketMetadata | null =
    selected && liveScore !== undefined
      ? {
          v: 1,
          source: "hackernews",
          storyId: selected.id,
          title: selected.title ?? "",
          url: selected.url ?? `https://news.ycombinator.com/item?id=${selected.id}`,
          question: `Will HN story ${selected.id} ${buildQuestion(target)}?`,
          baselineScore: liveScore,
          targetScore: target,
        }
      : null;
  const hashPreview = meta ? buildMetadataHash(meta) : null;

  useEffect(() => {
    if (!receipt.isSuccess || !receipt.data || doneRef.current) return;
    doneRef.current = true;
    const go = async () => {
      let newId: string | null = null;
      try {
        const log = receipt.data.logs.find(
          (l) => l.topics[0]?.toLowerCase() === MARKET_CREATED_TOPIC.toLowerCase(),
        );
        if (log) {
          const decoded = decodeEventLog({
            abi: launchOddsAbi,
            topics: log.topics as [],
            data: log.data,
          });
          if (decoded.eventName === "MarketCreated") {
            const args = decoded.args as unknown as { marketId: bigint };
            newId = args.marketId.toString();
          }
        }
      } catch {
        /* fall through to marketCount */
      }
      if (!newId && publicClient && CONTRACT_ADDRESS) {
        try {
          const count = (await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: launchOddsAbi,
            functionName: "marketCount",
          })) as bigint;
          newId = count.toString();
        } catch {
          /* give up redirect */
        }
      }
      if (toastRef.current !== null) {
        update(toastRef.current, {
          kind: "success",
          title: "Market created",
          link: newId
            ? { href: `/markets/${newId}`, label: "Open market" }
            : undefined,
        });
      }
      setBusy(false);
      if (newId) router.push(`/markets/${newId}`);
    };
    void go();
  }, [receipt.isSuccess, receipt.data, publicClient, router, update]);

  useEffect(() => {
    if (receipt.isError && hash && toastRef.current !== null) {
      update(toastRef.current, {
        kind: "error",
        title: "Create reverted on-chain",
        link: { href: `https://testnet.monadexplorer.com/tx/${hash}`, label: "View on explorer" },
      });
      setBusy(false);
    }
  }, [receipt.isError, hash, update]);

  const addByPaste = async () => {
    setPasteError(null);
    const m = paste.match(/(\d{5,})/);
    if (!m) {
      setPasteError("Could not find a story ID — paste an HN link or a bare number.");
      return;
    }
    setPasteBusy(true);
    try {
      const item = await fetchItem(Number(m[1]));
      if (!isUsableStory(item) || typeof item.score !== "number") {
        setPasteError("That item is not a usable story (must be a live story with a score).");
        return;
      }
      setSelected(item);
      setPaste("");
    } catch {
      setPasteError("HN fetch failed — try again.");
    } finally {
      setPasteBusy(false);
    }
  };

  const create = async () => {
    if (!CONTRACT_ADDRESS || !publicClient || !meta || doneRef.current) return;
    setBusy(true);
    doneRef.current = false;
    try {
      const block = await publicClient.getBlock();
      const expiry = block.timestamp + BigInt(deadline);
      const id = push({ kind: "pending", title: "Awaiting wallet confirmation…" });
      toastRef.current = id;
      writeContract(
        {
          address: CONTRACT_ADDRESS,
          abi: launchOddsAbi,
          functionName: "createMarket",
          args: [
            BigInt(meta.storyId),
            BigInt(meta.baselineScore),
            BigInt(meta.targetScore),
            expiry,
            buildMetadataHash(meta),
          ],
          chainId: APP_CHAIN_ID,
        },
        {
          onError: (e) => {
            update(id, {
              kind: "error",
              title: "Create failed",
              body: e.message.slice(0, 300),
            });
            setBusy(false);
          },
          onSuccess: (h) => {
            update(id, {
              kind: "confirming",
              title: "Confirming on Monad testnet…",
              link: { href: `https://testnet.monadexplorer.com/tx/${h}`, label: "View on explorer" },
            });
          },
        },
      );
    } catch {
      setBusy(false);
    }
  };

  if (!isAddressSet(CONTRACT_ADDRESS)) {
    return (
      <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
        <p className="font-semibold text-yellow-300">Contract address not set</p>
      </div>
    );
  }

  const warn =
    selected && liveScore !== undefined && deadline > 0
      ? momentumWarning(momentum, target - liveScore, deadline)
      : null;

  const expiryPreview = Math.floor(Date.now() / 1000) + deadline;

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="text-2xl font-black">Create a market</h2>
      <ol className="mt-3 flex gap-2" aria-label="Create steps">
        {["Choose launch", "Target and deadline", "Review and confirm"].map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                  done ? "bg-yes text-black" : active ? "bg-monad text-white" : "bg-white/10 text-slate-400"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {n}
              </span>
              <span className={`text-sm ${active ? "font-semibold text-white" : "text-slate-400"}`}>
                {label}
              </span>
              {n < 3 && <span className="h-px flex-1 bg-white/10" />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste HN link or story ID…"
              aria-label="HN link or story ID"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            />
            <Button onClick={() => void addByPaste()} disabled={pasteBusy}>
              {pasteBusy ? "…" : "Add"}
            </Button>
          </div>
          {pasteError && <p className="mt-1 text-sm text-no">{pasteError}</p>}
          {selected && (
            <GlassCard className="mt-3 border-monad/40 p-3">
              <p className="text-sm">
                Selected: <b>{selected.title}</b>{" "}
                <span className="font-mono tabular-nums text-slate-400">
                  ({liveScore ?? "…"} pts)
                </span>
              </p>
            </GlassCard>
          )}
          <div className="mt-3">
            <DiscoverPanel onCreate={setSelected} />
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" disabled={!selected} onClick={() => setStep(2)}>
              Continue →
            </Button>
          </div>
        </div>
      )}

      {step === 2 && selected && (
        <GlassCard className="mt-4">
          <p className="font-semibold">{selected.title}</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            live baseline: <b>{liveScore ?? "…"}</b>
          </p>
          {momentum.ready ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
              <Sparkline points={momentum.points} />
              <span className="font-mono tabular-nums">
                {momentum.delta >= 0 ? "+" : ""}
                {momentum.delta} in last {momentum.minutes < 1 ? "<1" : Math.round(momentum.minutes)}m
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Watching score — momentum appears after 2 snapshots.
            </p>
          )}
          <div className="mt-3 text-sm font-semibold">Target +N points</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {TARGETS.map((t) => (
              <button
                key={t}
                onClick={() => setDelta(t)}
                aria-pressed={delta === t}
                className={`rounded-lg px-3 py-1 font-mono text-sm tabular-nums ${delta === t ? "bg-monad text-white" : "bg-white/10"}`}
              >
                +{t}
              </button>
            ))}
          </div>
          <div className="mt-3 text-sm font-semibold">Deadline</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {DEADLINES.map((d) => (
              <button
                key={d.label}
                onClick={() => setDeadline(d.secs)}
                aria-pressed={deadline === d.secs}
                className={`rounded-lg px-3 py-1 font-mono text-sm tabular-nums ${deadline === d.secs ? "bg-monad text-white" : "bg-white/10"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {warn && (
            <p className="mt-2 rounded-xl bg-yellow-500/10 p-2 text-xs text-yellow-300">{warn}</p>
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button variant="primary" disabled={liveScore === undefined} onClick={() => setStep(3)}>
              Review →
            </Button>
          </div>
        </GlassCard>
      )}

      {step === 3 && meta && (
        <GlassCard className="mt-4">
          <Pill tone="accent">Review</Pill>
          <p className="mt-2 font-semibold">{meta.question}</p>
          <dl className="mt-2 space-y-1 font-mono text-sm tabular-nums text-slate-300">
            <div>baseline: {meta.baselineScore}</div>
            <div>target: {meta.targetScore}</div>
            <div>
              expiry: ~{localTime(expiryPreview)} ({deadline}s from the next block)
            </div>
          </dl>
          <p className="mt-2 break-all font-mono text-xs text-slate-500">
            metadataHash: {hashPreview}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Expiry is computed from the latest block timestamp at submit time, not your
            browser clock.
          </p>
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void create()}>
              {busy ? "Confirming…" : "Create market"}
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function momentumWarning(
  momentum: ReturnType<typeof useMomentum>,
  needed: number,
  deadlineSecs: number,
): string | null {
  if (!momentum.ready || needed <= 0) return null;
  const spanH = momentum.minutes / 60;
  const recentRate = momentum.delta / Math.max(spanH, 1 / 60);
  if (recentRate <= 0) {
    return "Caution: this story's score is flat or declining lately — the target may be unreachable.";
  }
  const neededRate = needed / (deadlineSecs / 3600);
  if (neededRate > 3 * recentRate) {
    return `Caution: reaching +${needed} needs ~${neededRate.toFixed(1)} pts/h, far above the recent ~${recentRate.toFixed(1)} pts/h.`;
  }
  return null;
}
