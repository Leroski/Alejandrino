import { safeThumbnail } from "../types/video-metadata";
import type { NativePreview } from "./native-preview-client";
import { contentTitle } from "./video-title";

// Timestamps only: no images, tokens or provider text survive an unmounted card here.
const attempts = new Map<string, number>();
const COOLDOWN = 5 * 60 * 1000;

export function needsPreviewMetadata(preview: NativePreview): boolean {
  return !(preview.image || safeThumbnail(preview.metadata.thumbnail_url)) || !contentTitle(preview.metadata);
}

export function claimPreviewRefresh(key: string, manual = false, now = Date.now()): boolean {
  const last = attempts.get(key);
  if (!manual && last !== undefined && now - last < COOLDOWN) return false;
  attempts.delete(key);
  attempts.set(key, now);
  if (attempts.size > 256) attempts.delete(attempts.keys().next().value!);
  return true;
}
