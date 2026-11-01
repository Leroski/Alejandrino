"use client";

type NativeMessage = {
  id?: string;
  type: "DOWNLOAD" | "CHECK" | "OPEN";
  userId: string;
  techniqueId: string;
  url?: string;
};
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
