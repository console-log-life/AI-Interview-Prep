import { resolveSkillKey } from "@/lib/skills/graph";

/**
 * Turns a job description's skill lists into scoreable requirements.
 *
 * Pure so the de-duplication rules are testable without a database. Two of
 * them matter:
 *
 *  - A skill listed as both required and preferred counts once, as REQUIRED.
 *    Counting it twice would double its weight for no reason.
 *  - A skill the graph cannot map keeps `skillKey: null` rather than being
 *    dropped. `computeJobReadiness` then counts it as risk — an unmeasurable
 *    requirement is not a free pass.
 */

export type JobRequirement = {
  skillKey: string | null;
  label: string;
  required: boolean;
};

export function buildJobRequirements(args: {
  required: string[];
  preferred: string[];
}): JobRequirement[] {
  const seen = new Set<string>();
  const requirements: JobRequirement[] = [];

  // Required first, so it wins the de-duplication against preferred.
  for (const [list, isRequired] of [
    [args.required, true],
    [args.preferred, false],
  ] as const) {
    for (const label of list) {
      const trimmed = label.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      requirements.push({
        skillKey: resolveSkillKey(trimmed),
        label: trimmed,
        required: isRequired,
      });
    }
  }

  return requirements;
}
