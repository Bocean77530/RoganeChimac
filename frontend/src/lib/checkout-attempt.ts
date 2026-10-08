import { randomUuid } from "./random-uuid.ts";

const STORAGE_KEY = "seoultable-checkout-attempt-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Attempt = { payload: string; key: string };

function readAttempt(storage: Pick<Storage, "getItem">): Attempt | null {
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (!value) return null;
    const attempt = JSON.parse(value) as Attempt;
    return typeof attempt.payload === "string" && UUID_PATTERN.test(attempt.key) ? attempt : null;
  } catch {
    return null;
  }
}

export function getOrCreateCheckoutAttempt(
  payload: string,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  makeId: () => string = randomUuid,
): string {
  const current = readAttempt(storage);
  if (current?.payload === payload) return current.key;
  const key = makeId();
  storage.setItem(STORAGE_KEY, JSON.stringify({ payload, key }));
  return key;
}

export function clearCheckoutAttempt(
  key: string,
  storage: Pick<Storage, "getItem" | "removeItem"> = sessionStorage,
): void {
  if (readAttempt(storage)?.key === key) storage.removeItem(STORAGE_KEY);
}
