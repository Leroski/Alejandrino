"use client";

import { useSyncExternalStore } from "react";
import { NativeCheckClient, type NativeBridge } from "./native-check-client";
import { NativeCheckError } from "./native-protocol";
import { NativeMediaClient } from "./native-media-client";
import type { MediaAction, MediaStage } from "./native-media-protocol";
import { NativePreviewClient, type PreviewOptions } from "./native-preview-client";

declare global { interface Window { AlejandrinoBridgeV1?: NativeBridge; AlejandrinoMediaV1?: NativeBridge; AlejandrinoPreviewV1?: NativeBridge } }
const noOpSubscribe = () => () => {};
const isNative = () => typeof window !== "undefined" && typeof window.AlejandrinoBridgeV1?.postMessage === "function";
export function useNativeAndroid() { return useSyncExternalStore(noOpSubscribe, isNative, () => false); }
const hasMedia = () => typeof window !== "undefined" && typeof window.AlejandrinoMediaV1?.postMessage === "function";
export function useNativeMedia() { return useSyncExternalStore(noOpSubscribe, hasMedia, () => false); }
const hasPreview = () => typeof window !== "undefined" && typeof window.AlejandrinoPreviewV1?.postMessage === "function";
export function useNativePreview() { return useSyncExternalStore(noOpSubscribe, hasPreview, () => false); }

const previewClients = new WeakMap<NativeBridge, NativePreviewClient>();
export function readLocalPreview(input: { userId: string; techniqueId: string; accessToken: string },
    options: PreviewOptions, signal: AbortSignal) {
  const bridge = typeof window !== "undefined" ? window.AlejandrinoPreviewV1 : undefined;
  if (!bridge) return Promise.reject(new NativeCheckError("UNSUPPORTED_BRIDGE"));
  let client = previewClients.get(bridge);
  if (!client) { client = new NativePreviewClient(bridge); previewClients.set(bridge, client); }
  return client.run(input, options, signal);
}

const clients = new WeakMap<NativeBridge, NativeCheckClient>();
export function checkLocalVideo(input: { userId: string; techniqueId: string; accessToken: string }, signal: AbortSignal) {
  const bridge = typeof window !== "undefined" ? window.AlejandrinoBridgeV1 : undefined;
  if (!bridge) return Promise.reject(new NativeCheckError("UNSUPPORTED_BRIDGE"));
  let client = clients.get(bridge);
  if (!client) { client = new NativeCheckClient(bridge); clients.set(bridge, client); }
  return client.check(input, signal);
}

const mediaClients = new WeakMap<NativeBridge, NativeMediaClient>();
export function runLocalMedia(action: MediaAction, input: { userId: string; techniqueId: string; accessToken: string },
    signal: AbortSignal, progress: (stage: MediaStage) => void) {
  const bridge = typeof window !== "undefined" ? window.AlejandrinoMediaV1 : undefined;
  if (!bridge) return Promise.reject(new NativeCheckError("UNSUPPORTED_BRIDGE"));
  let client = mediaClients.get(bridge);
  if (!client) { client = new NativeMediaClient(bridge); mediaClients.set(bridge, client); }
  return client.run(action, input, signal, progress);
}
