"use client";

// React binding for lib/storage.ts. useSyncExternalStore is the right tool for
// a browser-only store: the server and the first client render both see the
// empty SERVER_STATE (so hydration matches), then React swaps in what is
// really in localStorage, and re-renders on any later change, including one
// made in another tab.

import { useSyncExternalStore } from "react";

import {
  getStoreState,
  SERVER_STATE,
  subscribeToStore,
  type StoreState,
} from "@/lib/storage";

export function useBrewStore(): StoreState {
  return useSyncExternalStore(subscribeToStore, getStoreState, () => SERVER_STATE);
}
