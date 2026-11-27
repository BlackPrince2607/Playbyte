import { APP_SHARE_URL } from "./links";

/**
 * Ensures share copy always ends with the app download link on its own line.
 * Idempotent when the link is already present.
 */
export function withAppDownloadLink(
  message: string,
  link: string = APP_SHARE_URL,
): string {
  const body = message.trim();
  const download = link.trim();
  if (!download) return body;
  if (!body) return download;
  if (body.includes(download)) return body;
  return `${body}\n${download}`;
}

/** Score / result share body (download link appended by {@link withAppDownloadLink}). */
export function scoreShareBody(brag: string, link: string = APP_SHARE_URL): string {
  return withAppDownloadLink(brag, link);
}

/** Moment / poll share body (download link appended by {@link withAppDownloadLink}). */
export function momentShareBody(pitch: string, link: string = APP_SHARE_URL): string {
  return withAppDownloadLink(pitch, link);
}
