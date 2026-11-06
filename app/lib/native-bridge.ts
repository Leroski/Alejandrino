"use client";

import { useSyncExternalStore } from "react";

type NativeMessage =
  | { type: "DOWNLOAD" | "CHECK" | "OPEN"; userId: string; techniqueId: string; url?: string }
  | { type: "OPEN_EXTERNAL"; url: string };
export type NativeResponse = {
  id?: string;
  type: "STATUS" | "AVAILABILITY" | "ERROR";
  techniqueId: string;
  status?: "downloading" | "merging" | "available" | "missing";
  available?: boolean;
  message?: string;
};

declare global {
  interface Window {
    AlejandrinoBridge?: { postMessage: (message: string) => void };
  }
}

const eventName = "alejandrino:native";

export function isNativeAndroid(): boolean {
  return typeof window !== "undefined" && !!window.AlejandrinoBridge;
}

// During Next.js SSR and hydration, the bridge must initially be absent on
// both sides. React then reads the browser snapshot and reveals Android controls.
const noOpSubscribe = () => () => {};
export function useNativeAndroid(): boolean {
  return useSyncExternalStore(noOpSubscribe, isNativeAndroid, () => false);
}

export function sendNative(message: NativeMessage): boolean {
  if (!isNativeAndroid()) return false;
  window.AlejandrinoBridge!.postMessage(JSON.stringify(message));
  return true;
}

export function subscribeNative(listener: (result: NativeResponse) => void): () => void {
  const onEvent = (event: Event) => {
    const payload = (event as CustomEvent<NativeResponse>).detail;
    if (payload && typeof payload === "object") listener(payload);
  };
  window.addEventListener(eventName, onEvent);
  return () => window.removeEventListener(eventName, onEvent);
}
