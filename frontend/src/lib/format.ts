import { formatEther } from "viem";

// MON with max 4 decimals, tabular numbers via `tabular-nums` class at call sites.
export function fmtMon(value: bigint): string {
  const s = formatEther(value);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 4).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
}

export function fmtScore(value: bigint | number): string {
  return value.toString();
}

export function localTime(tsSec: number): string {
  return new Date(tsSec * 1000).toLocaleString();
}

export function localTimeShort(tsSec: number): string {
  return new Date(tsSec * 1000).toLocaleTimeString();
}

export function relTime(targetSec: number, nowSec: number): string {
  const d = targetSec - nowSec;
  const abs = Math.abs(d);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const body = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return d >= 0 ? `in ${body}` : `${body} ago`;
}
