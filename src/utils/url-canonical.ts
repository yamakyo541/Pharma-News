/**
 * 配信済み判定・キャッシュキー用に URL を正規化する。
 * 同一記事の表記ゆれ（ホスト大小・末尾スラッシュ・#fragment）を吸収する。
 */
export function canonicalUrlForState(raw: string): string {
  const t = raw.trim();
  try {
    const u = new URL(t);
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return t;
  }
}
