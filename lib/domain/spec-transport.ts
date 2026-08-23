import { parseTaskSpec, type TaskSpec } from "@/lib/domain/spec";

/*
  Handing the specification from the wizard to the result page.

  Deliberately NOT a URL parameter. A specification contains the user's own task
  description and sample data; putting it in the query string would leak it into
  browser history, server access logs, referrer headers and analytics, and long
  descriptions would breach URL length limits.

  sessionStorage keeps it on the one device, in the one tab, until the tab closes.
  A durable shareable link arrives later via a server route and a random token.
*/

export const PENDING_SPEC_KEY = "specpilot:pending-spec:v1";
/** In-progress wizard answers, so a refresh does not discard typing. */
export const DRAFT_SPEC_KEY = "specpilot:draft:v1";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    // Storage can throw in private modes or when cookies are blocked.
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage disabled. The flow still works in-memory.
    return false;
  }
}

function readSpec(key: string): TaskSpec | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const result = parseTaskSpec(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to do — the value simply stays until the tab closes.
  }
}

export function savePendingSpec(spec: TaskSpec): boolean {
  return write(PENDING_SPEC_KEY, spec);
}

export function readPendingSpec(): TaskSpec | null {
  return readSpec(PENDING_SPEC_KEY);
}

export function clearPendingSpec(): void {
  remove(PENDING_SPEC_KEY);
}

/**
 * The draft is stored unvalidated: a half-filled specification is exactly what
 * we want to restore, so it is parsed leniently and merged over the defaults.
 */
export function saveDraft(spec: TaskSpec): boolean {
  return write(DRAFT_SPEC_KEY, spec);
}

export function readDraft(): Partial<TaskSpec> | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_SPEC_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<TaskSpec>)
      : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  remove(DRAFT_SPEC_KEY);
}
