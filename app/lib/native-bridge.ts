"use client";

import { useSyncExternalStore } from "react";
import { NativeCheckClient, type NativeBridge } from "./native-check-client";
import { NativeCheckError } from "./native-protocol";

declare global { interface Window { AlejandrinoBridgeV1?: NativeBridge } }
const noOpSubscribe = () => () => {};
const isNative = () => typeof window !== "undefined" && typeof window.AlejandrinoBridgeV1?.postMessage === "function";
export function useNativeAndroid() { return useSyncExternalStore(noOpSubscribe, isNative, () => false); }

const clients = new WeakMap<NativeBridge, NativeCheckClient>();
export function checkLocalVideo(input: { userId: string; techniqueId: string; accessToken: string }, signal: AbortSignal) {
  const bridge = typeof window !== "undefined" ? window.AlejandrinoBridgeV1 : undefined;
  if (!bridge) return Promise.reject(new NativeCheckError("UNSUPPORTED_BRIDGE"));
  let client = clients.get(bridge);
  if (!client) { client = new NativeCheckClient(bridge); clients.set(bridge, client); }
  return client.check(input, signal);
}
