const URL_RE = /https?:\/\/\S+/g;
const EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
const MULTI_SPACE_RE = /\s+/g;
const MULTI_BANG_RE = /！+/g;
const MULTI_PERIOD_RE = /。+/g;

export function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

export function cleanText(text: string): string {
  let s = text;
  s = s.replace(URL_RE, "");
  s = s.replace(EMOJI_RE, "");
  s = s.replace(/\n/g, " ");
  s = s.replace(/\u3000/g, "");
  s = s.replace(MULTI_SPACE_RE, " ");
  s = s.replace(MULTI_BANG_RE, "！");
  s = s.replace(MULTI_PERIOD_RE, "。");
  return s.trim();
}

const EXCLUDED_EXPAND_HOSTS = new Set(["x.com", "twitter.com"]);

/**
 * 短縮URLを並列HEAD展開し、展開後URLのホストが除外対象のものを落とした
 * Map<元の短縮URL, 展開後URL> を返す。
 */
export async function expandUrls(
  urls: string[],
  timeoutMs = 5_000,
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  if (urls.length === 0) return mapping;

  const results = await Promise.allSettled(
    urls.map(async (originalUrl) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(originalUrl, {
          method: "HEAD",
          redirect: "follow",
          signal: ctl.signal,
        });
        return { originalUrl, expandedUrl: res.url };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { originalUrl, expandedUrl } = r.value;
    try {
      if (!EXCLUDED_EXPAND_HOSTS.has(new URL(expandedUrl).hostname)) {
        mapping.set(originalUrl, expandedUrl);
      }
    } catch {
      // invalid URL — skip
    }
  }

  return mapping;
}
