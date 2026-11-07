import { ok, route } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import {
  getAllSkills,
  getHeadlineSkills,
  getStrongSkills,
  getWeakSkills,
} from "@/lib/skills/service";
import { SKILL_ACTION_LABEL } from "@/lib/skills/scoring";

/** GET /api/skills — the signed-in user's skill intelligence. */
export const GET = route(async () => {
  const user = await requireUser();

  const [headline, all, weak, strong] = await Promise.all([
    getHeadlineSkills(user.id),
    getAllSkills(user.id),
    getWeakSkills(user.id, 8),
    getStrongSkills(user.id, 8),
  ]);

  const decorate = <T extends { action: keyof typeof SKILL_ACTION_LABEL }>(
    rows: T[],
  ) => rows.map((row) => ({ ...row, actionLabel: SKILL_ACTION_LABEL[row.action] }));

  return ok({
    headline: decorate(headline),
    all: decorate(all),
    weak: decorate(weak),
    strong: decorate(strong),
  });
});

export const dynamic = "force-dynamic";
