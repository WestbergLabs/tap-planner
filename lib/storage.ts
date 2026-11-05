// Browser-only persistence for saved brews.
//
// Tap Planner used to keep nothing at all. Saved brews are the one deliberate
// exception, and the rules around it are strict:
//
//   - Everything lives in this browser's localStorage. No server, no account,
//     no analytics, no sync. The README and the welcome dialog say so, so keep
//     it true.
//   - Because browser storage is fragile (clearing site data, a new phone, a
//     different browser all lose it), the app must always make export easy and
//     obvious. This module owns the backup file format so that promise has one
//     home.
//   - Whatever is read back is untrusted: a restored file or an old schema is
//     validated with zod before it is used, and a corrupt entry never crashes
//     a page.
//
// This file has no React in it. The hook that subscribes components lives in
// lib/useBrewStore.ts.

import { z } from "zod";

import { toDateInputValue } from "@/lib/schedule";

export const STORAGE_KEY = "tap-planner:v1";

/** Where unreadable data is parked before it could be overwritten. */
const CORRUPT_KEY = "tap-planner:v1:unreadable";

/** Dispatched on window after every write so same-tab subscribers refresh. */
export const STORE_CHANGE_EVENT = "tap-planner:store-change";

export const BACKUP_FORMAT = "tap-planner-backup";
export const BACKUP_VERSION = 1;

/** How long a changed-but-unexported diary can sit before we nudge. */
export const BACKUP_REMINDER_DAYS = 14;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const wholeDays = z.number().int().min(0).max(365);

export const tastingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  carbonation: z.enum(["low", "right", "high", "unsure"]),
  wouldBrewAgain: z.enum(["yes", "maybe", "no"]),
  notes: z.string().max(2000),
  tastedOn: dateString,
});

/**
 * A recipe recorded with a brew that is not a Pinter BrewPack (another kit, or
 * the person's own). All free text. Optional on a brew, so diaries saved
 * before this existed still load unchanged and no version bump is needed.
 */
export const recipeSchema = z.object({
  system: z.string().max(80),
  ingredients: z.string().max(3000),
  method: z.string().max(3000),
});

export const brewSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  style: z.string().max(120),
  abv: z.number().min(0).max(30).nullable(),
  source: z.enum(["pack", "custom", "rotation"]),
  packId: z.string().max(120).optional(),
  pinter: z.number().int().min(1).max(50).optional(),
  timingMode: z.enum(["recommended", "minimum"]).optional(),
  brewDate: dateString,
  coldCrashDate: dateString.nullable(),
  conditioningDate: dateString,
  tapDate: dateString,
  brewDays: wholeDays,
  coldCrashDays: wholeDays,
  conditioningDays: wholeDays,
  note: z.string().max(2000),
  savedAt: z.string().max(40),
  tasting: tastingSchema.optional(),
  recipe: recipeSchema.optional(),
});

const settingsSchema = z.object({
  /** True once the person has chosen to stop the welcome pop-up. */
  hideWelcome: z.boolean(),
  lastExportedAt: z.string().max(40).nullable(),
});

const storeSchema = z.object({
  version: z.literal(1),
  brews: z.array(brewSchema).max(2000),
  settings: settingsSchema,
  /** ISO time of the most recent change, used to decide if a backup is stale. */
  updatedAt: z.string().max(40).nullable(),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  brews: z.array(brewSchema).max(2000),
});

export type Tasting = z.infer<typeof tastingSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type SavedBrew = z.infer<typeof brewSchema>;
export type Store = z.infer<typeof storeSchema>;

/** A brew as the planners hand it over: no id or timestamp yet. */
export type NewBrew = Omit<SavedBrew, "id" | "savedAt" | "note" | "tasting"> & {
  note?: string;
};

export const EMPTY_STORE: Store = {
  version: 1,
  brews: [],
  settings: { hideWelcome: false, lastExportedAt: null },
  updatedAt: null,
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type StoreState = {
  /** False on the server and during hydration, true once localStorage is read. */
  loaded: boolean;
  /** False when the browser refuses storage (private mode, blocked cookies). */
  available: boolean;
  store: Store;
};

/** What the server renders, and what the client shows until it has read disk. */
export const SERVER_STATE: StoreState = {
  loaded: false,
  available: false,
  store: EMPTY_STORE,
};

const UNAVAILABLE_STATE: StoreState = {
  loaded: true,
  available: false,
  store: EMPTY_STORE,
};

let cachedRaw: string | null | undefined;
let cachedState: StoreState = SERVER_STATE;
let cachedUnreadable = false;

function parseStore(raw: string | null): { store: Store; unreadable: boolean } {
  if (raw === null) {
    return { store: EMPTY_STORE, unreadable: false };
  }

  try {
    const parsed = storeSchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return { store: parsed.data, unreadable: false };
    }
  } catch {
    // Fall through: invalid JSON is treated the same as a failed schema check.
  }

  return { store: EMPTY_STORE, unreadable: true };
}

/**
 * The current state. Returns the same object until the stored text changes,
 * which is what React's useSyncExternalStore needs to avoid render loops.
 */
export function getStoreState(): StoreState {
  if (typeof window === "undefined") {
    return SERVER_STATE;
  }

  let raw: string | null;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage is blocked. Keep returning one stable object so React does not
    // re-render in a loop.
    if (!(cachedState.loaded && !cachedState.available)) {
      cachedRaw = undefined;
      cachedUnreadable = false;
      cachedState = UNAVAILABLE_STATE;
    }

    return cachedState;
  }

  if (raw === cachedRaw && cachedState.loaded) {
    return cachedState;
  }

  const { store, unreadable } = parseStore(raw);

  cachedRaw = raw;
  cachedUnreadable = unreadable;
  cachedState = { loaded: true, available: true, store };

  return cachedState;
}

/** Subscribe to changes from this tab and from other tabs. */
export function subscribeToStore(onChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === null || event.key === STORAGE_KEY) {
      onChange();
    }
  }

  window.addEventListener(STORE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(STORE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Apply a change and persist it. Returns false when the browser refused the
 * write, so callers can tell the person instead of pretending it saved.
 */
function commit(change: (current: Store) => Store, touch = true): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const current = getStoreState();

  if (!current.available) {
    return false;
  }

  const next = change(current.store);
  const stamped = touch ? { ...next, updatedAt: new Date().toISOString() } : next;

  try {
    // Never silently overwrite something we could not read: park the original
    // so a schema bug or a hand-edited value cannot destroy someone's diary.
    if (cachedUnreadable && cachedRaw) {
      window.localStorage.setItem(CORRUPT_KEY, cachedRaw);
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
  } catch {
    return false;
  }

  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));

  return true;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** The saved brew that is the same batch, if any. Used to avoid duplicates. */
export function findDuplicate(
  brews: SavedBrew[],
  candidate: Pick<NewBrew, "name" | "brewDate" | "tapDate" | "pinter">,
): SavedBrew | undefined {
  // `pinter` is part of the identity: two Pinters can brew the same beer on
  // the same days and are still two batches.
  return brews.find(
    (brew) =>
      brew.name === candidate.name &&
      brew.brewDate === candidate.brewDate &&
      brew.tapDate === candidate.tapDate &&
      brew.pinter === candidate.pinter,
  );
}

/** Save a brew. Returns the saved record, or null if storage refused it. */
export function addBrew(input: NewBrew): SavedBrew | null {
  const brew: SavedBrew = {
    ...input,
    note: input.note ?? "",
    id: newId(),
    savedAt: new Date().toISOString(),
  };

  const ok = commit((store) => ({ ...store, brews: [...store.brews, brew] }));

  return ok ? brew : null;
}

export function updateBrew(
  id: string,
  patch: Partial<Pick<SavedBrew, "note" | "tasting">>,
): boolean {
  return commit((store) => ({
    ...store,
    brews: store.brews.map((brew) =>
      brew.id === id ? { ...brew, ...patch } : brew,
    ),
  }));
}

export function removeBrew(id: string): boolean {
  return commit((store) => ({
    ...store,
    brews: store.brews.filter((brew) => brew.id !== id),
  }));
}

export function setHideWelcome(hide: boolean): boolean {
  if (getStoreState().store.settings.hideWelcome === hide) {
    return true;
  }

  // A settings change is not a change to the diary, so it must not make a
  // fresh backup look stale.
  return commit(
    (store) => ({ ...store, settings: { ...store.settings, hideWelcome: hide } }),
    false,
  );
}

/** Wipe all saved brews. Settings (and the backup date) stay. */
export function clearBrews(): boolean {
  return commit((store) => ({ ...store, brews: [] }));
}

// ---------------------------------------------------------------------------
// Backup and restore
// ---------------------------------------------------------------------------

export function backupFileName(now: Date = new Date()): string {
  return `tap-planner-backup-${toDateInputValue(now)}.json`;
}

export function buildBackup(brews: SavedBrew[], now: Date = new Date()): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      brews,
    },
    null,
    2,
  );
}

/** Download every saved brew as a JSON backup and record the backup time. */
export function downloadBackup(now: Date = new Date()): string | null {
  const { store, available } = getStoreState();

  if (!available) {
    return null;
  }

  const fileName = backupFileName(now);
  const blob = new Blob([buildBackup(store.brews, now)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  // Recording the date is not a diary change either.
  commit(
    (current) => ({
      ...current,
      settings: { ...current.settings, lastExportedAt: now.toISOString() },
    }),
    false,
  );

  return fileName;
}

export type ParsedBackup =
  | { ok: true; brews: SavedBrew[]; exportedAt: string }
  | { ok: false; error: string };

/** Validate the text of a backup file. Never throws. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not a Tap Planner backup." };
  }

  const parsed = backupSchema.safeParse(json);

  if (!parsed.success) {
    return {
      ok: false,
      error:
        "That file is not a Tap Planner backup, or it was made by a newer version of the app.",
    };
  }

  return { ok: true, brews: parsed.data.brews, exportedAt: parsed.data.exportedAt };
}

/**
 * Put restored brews into the diary. "merge" keeps what is already here and
 * lets the file win when both hold the same batch; "replace" swaps everything.
 */
export function restoreBrews(
  incoming: SavedBrew[],
  mode: "merge" | "replace",
): boolean {
  return commit((store) => {
    if (mode === "replace") {
      return { ...store, brews: incoming };
    }

    const byId = new Map(store.brews.map((brew) => [brew.id, brew]));

    for (const brew of incoming) {
      byId.set(brew.id, brew);
    }

    return { ...store, brews: [...byId.values()] };
  });
}

// ---------------------------------------------------------------------------
// Backup nudges
// ---------------------------------------------------------------------------

export type BackupStatus = {
  /** True when the person should be reminded to export. */
  needsBackup: boolean;
  /** Short, human reason; empty when no backup is needed. */
  reason: string;
};

/**
 * Whether to nudge. Brews that have never been exported always count, because
 * that is the moment losing them is most likely and most avoidable. After the
 * first export, only changes made since, and only once the last backup is a
 * couple of weeks old, so the reminder does not nag after every edit.
 */
export function getBackupStatus(store: Store, now: Date = new Date()): BackupStatus {
  if (store.brews.length === 0) {
    return { needsBackup: false, reason: "" };
  }

  const { lastExportedAt } = store.settings;

  if (!lastExportedAt) {
    return {
      needsBackup: true,
      reason: "These brews exist only in this browser and have never been backed up.",
    };
  }

  const exported = Date.parse(lastExportedAt);
  const changed = store.updatedAt ? Date.parse(store.updatedAt) : 0;

  if (Number.isNaN(exported)) {
    return { needsBackup: true, reason: "Your last backup date could not be read." };
  }

  const ageDays = (now.getTime() - exported) / 86_400_000;

  if (changed > exported && ageDays >= BACKUP_REMINDER_DAYS) {
    return {
      needsBackup: true,
      reason: "You have made changes since your last backup.",
    };
  }

  return { needsBackup: false, reason: "" };
}
