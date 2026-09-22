import { Directory, File, Paths } from "expo-file-system";

/**
 * expo-sharing only accepts local file:// URIs. Share-card API returns https CDN URLs,
 * so download to cache first.
 */
export async function ensureLocalShareUri(assetUrl: string, fileName: string): Promise<string> {
  if (assetUrl.startsWith("file:")) return assetUrl;

  const dir = new Directory(Paths.cache, "share-cards");
  dir.create({ intermediates: true, idempotent: true });

  const target = new File(dir, fileName);
  const downloaded = await File.downloadFileAsync(assetUrl, target, { idempotent: true });
  return downloaded.uri;
}
