import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalUrlForState } from "./url-canonical.js";

export type UrlSummaryCacheEntry = {
  summary: string;
  savedAt: string;
};

export type UrlSummaryCacheFile = {
  entries: Record<string, UrlSummaryCacheEntry>;
};

export type UrlSummaryCacheSettings = {
  enabled: boolean;
  filePath: string;
  maxAgeDays: number;
  maxEntries: number;
};

function cacheKey(url: string): string {
  return canonicalUrlForState(url);
}

export async function loadUrlSummaryCache(
  filePath: string,
): Promise<Map<string, UrlSummaryCacheEntry>> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as UrlSummaryCacheFile;
    const map = new Map<string, UrlSummaryCacheEntry>();
    for (const [k, v] of Object.entries(data.entries ?? {})) {
      map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function getCachedSummary(
  cache: Map<string, UrlSummaryCacheEntry>,
  url: string,
  maxAgeMs: number,
): string | undefined {
  const key = cacheKey(url);
  const entry = cache.get(key);
  if (!entry?.summary) return undefined;
  const age = Date.now() - new Date(entry.savedAt).getTime();
  if (age > maxAgeMs) return undefined;
  return entry.summary;
}

export function setCachedSummary(
  cache: Map<string, UrlSummaryCacheEntry>,
  url: string,
  summary: string,
): void {
  const key = cacheKey(url);
  cache.set(key, { summary, savedAt: new Date().toISOString() });
}

export function pruneUrlSummaryCache(
  cache: Map<string, UrlSummaryCacheEntry>,
  maxAgeMs: number,
  maxEntries: number,
): void {
  const now = Date.now();
  for (const [k, v] of [...cache.entries()]) {
    if (now - new Date(v.savedAt).getTime() > maxAgeMs) {
      cache.delete(k);
    }
  }
  if (cache.size <= maxEntries) return;
  const sorted = [...cache.entries()].sort(
    (a, b) =>
      new Date(b[1].savedAt).getTime() - new Date(a[1].savedAt).getTime(),
  );
  cache.clear();
  for (const [k, v] of sorted.slice(0, maxEntries)) {
    cache.set(k, v);
  }
}

export async function saveUrlSummaryCache(
  filePath: string,
  cache: Map<string, UrlSummaryCacheEntry>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const entries: Record<string, UrlSummaryCacheEntry> = {};
  for (const [k, v] of cache.entries()) {
    entries[k] = v;
  }
  const body: UrlSummaryCacheFile = { entries };
  await writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
}
