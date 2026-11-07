import { describe, expect, it } from "vitest";

import { filterGroundedClaims, groundClaim } from "@/lib/resume/grounding";

/**
 * The gate between claim extraction and the interview.
 *
 * An extracted claim becomes probe questions the interviewer asks *as fact*.
 * So the failure this guards is not an untidy table — it is a candidate being
 * asked, out loud, how they measured a number they never wrote.
 *
 * Two behaviours are pinned: a figure absent from the résumé is fatal, and
 * ordinary rewording is not.
 */

const RESUME = `
Aarav Sharma — Backend Engineer

EXPERIENCE
Acme Corp (2023-2025)
- Architected and delivered a REST API using Node.js and Express
- Reduced p95 latency by 40% by adding a Redis cache layer
- Migrated 12 services from MongoDB to PostgreSQL
- Mentored 3 junior engineers

PROJECTS
- Built a real-time chat app with WebSockets and Redis
`;

describe("groundClaim — invented figures are fatal", () => {
  it("rejects a metric the résumé does not contain", () => {
    // The whole reason this module exists: this claim would otherwise be
    // probed as "how did you measure that 60%?".
    const result = groundClaim("Reduced p95 latency by 60%", RESUME);

    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("UNSUPPORTED_NUMBER");
    expect(result.missingNumbers).toContain("60");
  });

  it("accepts the figure the résumé actually states", () => {
    expect(groundClaim("Reduced p95 latency by 40%", RESUME).grounded).toBe(true);
  });

  it("rejects an inflated count", () => {
    const result = groundClaim("Migrated 50 services to PostgreSQL", RESUME);
    expect(result.grounded).toBe(false);
    expect(result.missingNumbers).toContain("50");
  });

  it("accepts the stated count", () => {
    expect(groundClaim("Migrated 12 services to PostgreSQL", RESUME).grounded).toBe(
      true,
    );
  });

  it("rejects a number even when every word around it matches", () => {
    // Overlap would pass easily here; the figure is the only invented part,
    // and it is the part that gets asked about.
    const result = groundClaim("Mentored 30 junior engineers", RESUME);
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("UNSUPPORTED_NUMBER");
  });

  it("matches a figure written with thousands separators in the source", () => {
    const resume = "Handled 1,200 requests per second at peak";
    expect(groundClaim("Handled 1200 requests per second", resume).grounded).toBe(
      true,
    );
  });

  it("reports every missing figure, not just the first", () => {
    const result = groundClaim("Cut latency 60% across 50 services", RESUME);
    expect(result.missingNumbers).toEqual(expect.arrayContaining(["60", "50"]));
  });
});

describe("groundClaim — rewording is allowed", () => {
  it("accepts a compressed restatement", () => {
    // "Architected and delivered" → "Built". Rejecting this would throw away
    // a real claim for a cosmetic difference.
    expect(groundClaim("Built a REST API using Node.js", RESUME).grounded).toBe(true);
  });

  it("ignores case and punctuation from PDF extraction", () => {
    expect(groundClaim("built a rest api with node.js!", RESUME).grounded).toBe(true);
  });

  it("accepts a claim about a project the résumé lists", () => {
    expect(
      groundClaim("Built a real-time chat app with WebSockets", RESUME).grounded,
    ).toBe(true);
  });

  it("is not fooled by filler words alone", () => {
    // Every word here is noise or absent; nothing distinctive is shared.
    const result = groundClaim("Led the transformation of our cloud estate", RESUME);
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("LOW_OVERLAP");
  });

  it("rejects a technology the résumé never mentions", () => {
    const result = groundClaim("Deployed Kubernetes clusters on GCP", RESUME);
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("LOW_OVERLAP");
  });
});

describe("groundClaim — degenerate input", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("rejects an %s claim", (_label, text) => {
    const result = groundClaim(text, RESUME);
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("EMPTY");
  });

  it("rejects everything when the résumé text is empty", () => {
    // No source means nothing can be supported by it.
    expect(groundClaim("Built a REST API", "").grounded).toBe(false);
  });

  it("reports an overlap between 0 and 1", () => {
    const result = groundClaim("Built a REST API using Node.js", RESUME);
    expect(result.overlap).toBeGreaterThan(0);
    expect(result.overlap).toBeLessThanOrEqual(1);
  });

  it("leaves missingNumbers empty on a grounded claim", () => {
    expect(groundClaim("Mentored 3 junior engineers", RESUME).missingNumbers).toEqual(
      [],
    );
  });
});

/**
 * PDF extraction artefacts.
 *
 * Every case below is something pdf.js genuinely emits, and each one used to
 * drop a *legitimate* claim — the worst failure this filter can have, because
 * the candidate loses a real probe question and nothing says why.
 *
 * The snippets are anonymised fragments written for this file, not extracts of
 * anyone's résumé. The number check must stay strict throughout: normalisation
 * decides which characters are the same character, never which figures count.
 */
describe("groundClaim — PDF extraction artefacts", () => {
  it("matches across a ligature", () => {
    // A PDF often stores "fi" as the single glyph U+FB01, so "verified"
    // extracted as "veri" + "ed" and never matched the model's "verified".
    const resume = "Veri\ufb01ed payment \ufb02ows for the checkout service";
    expect(groundClaim("Verified payment flows for checkout", resume).grounded).toBe(
      true,
    );
  });

  it("matches across a curly apostrophe", () => {
    const resume = "Owned the team\u2019s deployment pipeline end to end";
    expect(groundClaim("Owned the team's deployment pipeline", resume).grounded).toBe(
      true,
    );
  });

  it("matches across an en dash in a range", () => {
    const resume = "Backend Engineer, 2023\u20132025, order service";
    const result = groundClaim("Worked on the order service 2023-2025", resume);
    expect(result.missingNumbers).toEqual([]);
    expect(result.grounded).toBe(true);
  });

  it("matches across a non-breaking space", () => {
    // U+00A0 is a space separator, not a control character, so the strip in
    // extract.ts leaves it in place.
    const resume = "Built\u00a0a\u00a0REST\u00a0API\u00a0in\u00a0Node.js";
    expect(groundClaim("Built a REST API in Node.js", resume).grounded).toBe(true);
  });

  it("matches a word hyphenated across a line break", () => {
    // Two-column layouts wrap mid-word.
    const resume = "Decomposed the monolith into micro-\nservices with Kafka";
    expect(groundClaim("Decomposed the monolith into microservices", resume).grounded).toBe(
      true,
    );
  });

  it("matches when extraction lost the spaces entirely", () => {
    // The model reads the glued text and writes it back spaced correctly, so
    // the tokens stop matching even though the claim is faithful.
    const resume = "ReducedP95checkoutlatencyby35%usingaRediscache";
    const result = groundClaim("Reduced p95 checkout latency by 35%", resume);
    expect(result.missingNumbers).toEqual([]);
    expect(result.grounded).toBe(true);
  });

  it("still rejects an invented figure in glued text", () => {
    // The whole point: leniency about characters must not become leniency
    // about numbers.
    const resume = "ReducedP95checkoutlatencyby35%usingaRediscache";
    const result = groundClaim("Reduced p95 checkout latency by 80%", resume);
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("UNSUPPORTED_NUMBER");
    expect(result.missingNumbers).toContain("80");
  });

  it("does not let the glued fallback match a short token by accident", () => {
    // "api" and "sql" occur inside unrelated words once spaces are gone, so
    // the fallback only applies from five characters up. This claim shares
    // nothing real with the source and must still be rejected.
    const resume = "Rapidly shipped a graphical dashboard for internal use";
    expect(groundClaim("Built an API with SQL and Go", resume).grounded).toBe(false);
  });

  it("still rejects a genuinely unrelated claim after normalisation", () => {
    const resume = "Veri\ufb01ed payment \ufb02ows for the checkout\u00a0service";
    const result = groundClaim("Administered Kubernetes clusters on GCP", resume);
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("LOW_OVERLAP");
  });
});

describe("filterGroundedClaims", () => {
  const CLAIMS = [
    { text: "Reduced p95 latency by 40% with a Redis cache" },
    { text: "Reduced p95 latency by 90%" },
    { text: "Built a REST API using Node.js" },
    { text: "Led a team of 25 engineers across 4 continents" },
  ];

  it("keeps the supported claims", () => {
    const { kept } = filterGroundedClaims(CLAIMS, RESUME);
    expect(kept.map((c) => c.text)).toEqual([
      "Reduced p95 latency by 40% with a Redis cache",
      "Built a REST API using Node.js",
    ]);
  });

  it("returns the rejected ones with a reason rather than silently dropping", () => {
    // A silent filter would hide a degrading prompt behind a shorter list.
    const { dropped } = filterGroundedClaims(CLAIMS, RESUME);
    expect(dropped).toHaveLength(2);
    expect(dropped.map((d) => d.result.reason)).toEqual([
      "UNSUPPORTED_NUMBER",
      "UNSUPPORTED_NUMBER",
    ]);
  });

  it("preserves order among the kept claims", () => {
    const { kept } = filterGroundedClaims(
      [{ text: "Mentored 3 junior engineers" }, { text: "Built a REST API" }],
      RESUME,
    );
    expect(kept[0].text).toBe("Mentored 3 junior engineers");
  });

  it("handles an empty extraction", () => {
    expect(filterGroundedClaims([], RESUME)).toEqual({ kept: [], dropped: [] });
  });

  it("drops everything when there is no résumé text to check against", () => {
    const { kept, dropped } = filterGroundedClaims(CLAIMS, "");
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(CLAIMS.length);
  });
});
