/**
 * The attention-tracking feature flag.
 *
 * `NEXT_PUBLIC_ATTENTION_TRACKING` rather than a server-only variable because
 * the decision is needed in the browser — the consent notice and the sampling
 * loop both live there — and a `NEXT_PUBLIC_` value is inlined at build time
 * so there is no round trip to ask.
 *
 * Default **off**. Everything this flag gates is new, and camera-derived
 * feedback is exactly the kind of feature that should be opted into
 * deliberately rather than arriving with an upgrade.
 *
 * The value is taken as an argument so the parsing can be tested without
 * mutating the environment, which under a bundler that inlines the variable is
 * not reliably possible anyway.
 */
export function attentionTrackingEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_ATTENTION_TRACKING,
): boolean {
  // Strictly "true". A missing, empty, misspelt or truthy-looking value such as
  // "1" or "yes" reads as off: a flag that guards a camera feature must fail
  // closed, and silently enabling it on a typo is the wrong direction to err.
  return (value ?? "").trim().toLowerCase() === "true";
}

/**
 * Where the candidate's choice lives.
 *
 * `sessionStorage`, not `localStorage`: consent to be measured during *this*
 * interview should not silently carry over to one they sit next month on a
 * shared machine. It is re-asked each session, which is the honest default
 * even though it is the slightly more annoying one.
 */
export const ATTENTION_CONSENT_KEY = "preppilot.attention-consent";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function sessionStore(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    // Blocked site data, or a private window. Not an error — it just means
    // there is no stored consent, which reads as "not yet asked".
    return null;
  }
}

/** The candidate's choice, or null if they have not been asked yet. */
export function attentionConsent(storage: StorageLike | null = sessionStore()): boolean | null {
  try {
    const raw = storage?.getItem(ATTENTION_CONSENT_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function setAttentionConsent(
  value: boolean,
  storage: StorageLike | null = sessionStore(),
): void {
  try {
    storage?.setItem(ATTENTION_CONSENT_KEY, value ? "true" : "false");
  } catch {
    // Unwritable storage means the choice is not remembered across a reload.
    // The interview still runs; it just asks again, which is the safe way for
    // this particular failure to go.
  }
}

/**
 * Should anything actually be measured right now?
 *
 * Both conditions, deliberately. The flag alone decides whether the feature
 * exists in this deployment; it does not decide whether this candidate agreed
 * to it. A null consent — never asked, or storage unavailable — reads as no.
 */
export function attentionActive(
  flagValue?: string,
  storage: StorageLike | null = sessionStore(),
): boolean {
  return attentionTrackingEnabled(flagValue) && attentionConsent(storage) === true;
}
