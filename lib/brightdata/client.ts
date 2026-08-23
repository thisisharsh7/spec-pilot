import "server-only";

/*
  Server-only Bright Data Scraper Studio client.

  `import "server-only"` above is the real guard: Next aliases that module and
  fails the BUILD if this file is ever pulled into a client bundle. The runtime
  check below is belt-and-braces for non-Next callers such as unit tests.

  Only the two endpoints confirmed in current Scraper Studio documentation are
  used:

    POST /dca/trigger?collector=c_…   body: [{ "url": … }]  -> { collection_id }
    GET  /dca/dataset?id=j_…          -> 202 while building, 200 with a JSON array

  `/dca/log` and the `deadline` parameter are deliberately not used.

  The API token is read here and never returned, logged, or included in an error
  message. Every error crossing this boundary is rewritten into a safe string.
*/

if (typeof window !== "undefined") {
  throw new Error("The Bright Data client must never run in a browser.");
}

const BASE_URL = "https://api.brightdata.com";

const DEFAULTS = {
  /** Docs poll every 5s. */
  pollIntervalMs: 5_000,
  /** Bounded, not open-ended: ~5 minutes for a five-URL batch. */
  maxPolls: 60,
  requestTimeoutMs: 30_000,
  maxTransientRetries: 3,
};

export class BrightDataError extends Error {
  readonly safeMessage: string;
  readonly status: number | null;

  constructor(safeMessage: string, status: number | null = null) {
    super(safeMessage);
    this.name = "BrightDataError";
    this.safeMessage = safeMessage;
    this.status = status;
  }
}

export interface BrightDataConfig {
  apiToken: string;
  collectorId: string;
}

export interface TriggerResult {
  /** Bright Data returns `collection_id`; it doubles as the snapshot id. */
  collectionId: string;
  startEta: string | null;
}

export type DatasetPoll =
  | { state: "building" }
  | { state: "ready"; rows: unknown[] };

function authHeaders(apiToken: string): HeadersInit {
  return {
    // Never logged. Never echoed into an error or a response body.
    authorization: `Bearer ${apiToken}`,
    "content-type": "application/json",
  };
}

/** Map a status code to a message that leaks nothing about the request. */
function describeStatus(status: number, what: string): string {
  if (status === 401) {
    return `Bright Data rejected the credentials while ${what}. Check BRIGHT_DATA_API_TOKEN.`;
  }
  if (status === 404) {
    return `Bright Data could not find the collector or collection while ${what}. It may have expired.`;
  }
  if (status === 422) {
    return `Bright Data rejected the request shape while ${what}. The collector's input schema may have changed.`;
  }
  if (status === 429) {
    return `Bright Data rate-limited the request while ${what}.`;
  }
  if (status >= 500) {
    return `Bright Data returned a server error (${status}) while ${what}.`;
  }
  return `Bright Data returned an unexpected status (${status}) while ${what}.`;
}

function isTransient(status: number): boolean {
  return status >= 500 || status === 429;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new BrightDataError("The refresh was cancelled."));
      },
      { once: true },
    );
  });
}

async function request(
  url: string,
  init: RequestInit,
  what: string,
  signal?: AbortSignal,
): Promise<Response> {
  let attempt = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: signal ?? AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
      });
    } catch {
      // Deliberately does not surface the underlying error, which can contain
      // the request URL and headers.
      if (attempt >= DEFAULTS.maxTransientRetries) {
        throw new BrightDataError(`Could not reach Bright Data while ${what}.`);
      }
      await sleep(2 ** attempt * 1_000, signal);
      attempt += 1;
      continue;
    }

    if (response.ok || response.status === 202) return response;

    if (isTransient(response.status) && attempt < DEFAULTS.maxTransientRetries) {
      // Exponential backoff: 1s, 2s, 4s.
      await sleep(2 ** attempt * 1_000, signal);
      attempt += 1;
      continue;
    }

    throw new BrightDataError(describeStatus(response.status, what), response.status);
  }
}

/** POST /dca/trigger — queue a batch of URLs against the collector. */
export async function triggerCollection(
  config: BrightDataConfig,
  urls: string[],
  signal?: AbortSignal,
): Promise<TriggerResult> {
  if (urls.length === 0) {
    throw new BrightDataError("Refusing to trigger a collection with no URLs.");
  }

  const endpoint = `${BASE_URL}/dca/trigger?collector=${encodeURIComponent(
    config.collectorId,
  )}&queue_next=1`;

  const response = await request(
    endpoint,
    {
      method: "POST",
      headers: authHeaders(config.apiToken),
      // The documented body is an ARRAY of input objects.
      body: JSON.stringify(urls.map((url) => ({ url }))),
    },
    "starting the collection",
    signal,
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BrightDataError("Bright Data returned an unreadable trigger response.");
  }

  const collectionId =
    body !== null && typeof body === "object" && "collection_id" in body
      ? String((body as { collection_id?: unknown }).collection_id ?? "")
      : "";

  if (!collectionId) {
    throw new BrightDataError("Bright Data did not return a collection id.");
  }

  const startEta =
    body !== null && typeof body === "object" && "start_eta" in body
      ? String((body as { start_eta?: unknown }).start_eta ?? "") || null
      : null;

  return { collectionId, startEta };
}

/**
 * GET /dca/dataset?id=… — one poll.
 *
 * Branches on the HTTP STATUS, not on whether the array is empty. The vendor's
 * own examples loop forever on a legitimately empty result set.
 */
export async function pollDataset(
  config: BrightDataConfig,
  collectionId: string,
  signal?: AbortSignal,
): Promise<DatasetPoll> {
  const endpoint = `${BASE_URL}/dca/dataset?id=${encodeURIComponent(collectionId)}`;

  const response = await request(
    endpoint,
    { method: "GET", headers: authHeaders(config.apiToken) },
    "collecting results",
    signal,
  );

  if (response.status === 202) return { state: "building" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BrightDataError("Bright Data returned an unreadable dataset response.");
  }

  if (Array.isArray(body)) return { state: "ready", rows: body };

  // A 200 carrying an object rather than an array means still building.
  if (
    body !== null &&
    typeof body === "object" &&
    "status" in body &&
    String((body as { status?: unknown }).status) === "building"
  ) {
    return { state: "building" };
  }

  throw new BrightDataError("Bright Data returned an unexpected dataset shape.");
}

export interface CollectionRun {
  collectionId: string;
  rows: unknown[];
  polls: number;
}

/** Trigger, then poll until ready or the bounded budget is exhausted. */
export async function runCollection(
  config: BrightDataConfig,
  urls: string[],
  options: { pollIntervalMs?: number; maxPolls?: number; signal?: AbortSignal } = {},
): Promise<CollectionRun> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULTS.pollIntervalMs;
  const maxPolls = options.maxPolls ?? DEFAULTS.maxPolls;

  const { collectionId } = await triggerCollection(config, urls, options.signal);

  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const result = await pollDataset(config, collectionId, options.signal);
    if (result.state === "ready") {
      return { collectionId, rows: result.rows, polls: poll };
    }
    await sleep(pollIntervalMs, options.signal);
  }

  throw new BrightDataError(
    `The collection did not finish within ${maxPolls} polls. Snapshot ${collectionId} may still complete; the stored dataset was left unchanged.`,
  );
}
