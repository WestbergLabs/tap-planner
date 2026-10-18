import { useSyncExternalStore } from "react";

// One shared, remembered "Show discontinued" setting for every BrewPack picker.
// Backed by localStorage; the custom event keeps pickers on the same page in
// sync (the native "storage" event only fires in other tabs).
const KEY = "tap-planner:show-discontinued";
const EVENT = "tap-planner:show-discontinued-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: the setting just isn't remembered
  }
}

export function useShowDiscontinued(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, read, () => false);

  function set(next: boolean) {
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // ignore; the toggle still works until the page reloads
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return [value, set];
}
