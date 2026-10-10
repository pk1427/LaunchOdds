import { keccak256, toHex } from "viem";

export interface MarketMetadata {
  v: 1;
  source: "hackernews";
  storyId: number;
  title: string;
  url: string;
  question: string;
  baselineScore: number;
  targetScore: number;
}

export function buildQuestion(targetScore: number): string {
  return `reach ${targetScore} points by deadline`;
}

export function buildMetadataHash(meta: MarketMetadata): `0x${string}` {
  return keccak256(toHex(JSON.stringify(meta)));
}

export interface ResolutionEvidence {
  source: "hackernews";
  storyId: number;
  score: number;
  fetchedAt: number;
  apiUrl: string;
}

export function buildEvidence(storyId: number, score: number): {
  json: ResolutionEvidence;
  hash: `0x${string}`;
} {
  const json: ResolutionEvidence = {
    source: "hackernews",
    storyId,
    score,
    fetchedAt: Math.floor(Date.now() / 1000),
    apiUrl: `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`,
  };
  return { json, hash: keccak256(toHex(JSON.stringify(json))) };
}
