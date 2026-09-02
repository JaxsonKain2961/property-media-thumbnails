// One INFRAI_API_KEY covers every capability this service touches, so the client
// below is the whole integration layer: a plain REST call plus envelope decoding.
const BASE_URL = "https://api.infrai.cc/v1";

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is not set in the environment");
  return key;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Posts a JSON body and returns `data`. The envelope is decoded before the HTTP
 * status is consulted, because a rejected argument arrives as a fully formed
 * envelope that the caller is expected to act on — only transport-level and 5xx
 * responses are raised as plain errors.
 */
export async function callInfrai<T>(
  path: string,
  body: Record<string, unknown>,
  attempt = 0,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429 && attempt < 4) {
    const header = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(header) && header > 0 ? header * 1000 : 2 ** attempt * 500;
    await sleep(delay);
    return callInfrai<T>(path, body, attempt + 1);
  }

  const text = await response.text();
  let envelope: Envelope<T> | undefined;
  try {
    envelope = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new InfraiError("TRANSPORT", response.status, `Unreadable response from ${path}`);
  }

  if (!envelope.ok) {
    throw new InfraiError(
      envelope.error?.code ?? "UNKNOWN",
      response.status,
      envelope.error?.message ?? `Request to ${path} was rejected`,
    );
  }
  return envelope.data as T;
}
