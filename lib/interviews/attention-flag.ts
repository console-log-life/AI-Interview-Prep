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
