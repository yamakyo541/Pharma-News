import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RawTweet } from "../types.js";
import { canonicalUrlForState } from "./url-canonical.js";

export type DeliveredStateFile = {
  deliveredUrls: string[];
};

export async function loadDeliveredUrlSet(
  filePath: string,
): Promise<Set<string>> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as DeliveredStateFile;
    return new Set((data.deliveredUrls ?? []).map((u) => canonicalUrlForState(u)));
  } catch {
    return new Set();
  }
}

export function filterUndeliveredTweets(
  tweets: RawTweet[],
  delivered: Set<string>,
): RawTweet[] {
  return tweets.filter((t) => !delivered.has(canonicalUrlForState(t.url)));
}

/**
 * 配信成功後に canonical URL を追記し、件数上限で末尾を残す（古いキーを落とす）。
 */
export async function persistDeliveredUrls(
  filePath: string,
  newUrls: string[],
  maxTrackedUrls: number,
): Promise<void> {
  const existing = [...(await loadDeliveredUrlArray(filePath))];
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const u of existing) {
    const c = canonicalUrlForState(u);
    if (seen.has(c)) continue;
    seen.add(c);
    merged.push(c);
  }
  for (const u of newUrls) {
    const c = canonicalUrlForState(u);
    if (seen.has(c)) continue;
    seen.add(c);
    merged.push(c);
  }
  const trimmed =
    merged.length > maxTrackedUrls
      ? merged.slice(merged.length - maxTrackedUrls)
      : merged;

  await mkdir(dirname(filePath), { recursive: true });
  const body: DeliveredStateFile = { deliveredUrls: trimmed };
  await writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
}

async function loadDeliveredUrlArray(filePath: string): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as DeliveredStateFile;
    return data.deliveredUrls ?? [];
  } catch {
    return [];
  }
}
