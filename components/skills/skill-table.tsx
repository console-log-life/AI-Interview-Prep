import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CONFIDENCE_LABEL,
  SKILL_ACTION_LABEL,
  type SkillAction,
} from "@/lib/skills/scoring";
import type { SkillIntelligenceRow } from "@/lib/skills/service";
import { cn } from "@/lib/utils";

const ACTION_STYLE: Record<SkillAction, string> = {
  GATHER_EVIDENCE: "border-muted-foreground/30 text-muted-foreground",
  BUILD_FUNDAMENTALS: "border-destructive/30 bg-destructive/10 text-destructive",
  PRACTISE: "border-warning/40 bg-warning/10 text-warning-foreground",
  DEEPEN: "border-primary/40 bg-primary/10 text-primary",
  MAINTAIN: "border-success/40 bg-success/10 text-success",
};

/**
 * The full skill ledger.
 *
 * Sorted weakest-first by the service, because the useful question is "what
 * should I work on", not "what am I already good at".
 */
export function SkillTable({ skills }: { skills: SkillIntelligenceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Skill</TableHead>
            <TableHead className="w-[180px]">Score</TableHead>
            <TableHead className="w-[120px]">Confidence</TableHead>
            <TableHead className="w-[100px]">Trend</TableHead>
            <TableHead className="w-[110px]">Evidence</TableHead>
            <TableHead className="w-[150px]">Suggested</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((skill) => (
            <TableRow key={skill.skillKey}>
              <TableCell>
                <Link
                  href={`/skills/${encodeURIComponent(skill.skillKey)}`}
                  className={cn(
                    "rounded text-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    skill.isRoot ? "font-medium" : "pl-4 text-muted-foreground",
                  )}
                >
                  {skill.label}
                </Link>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress
                    value={skill.score}
                    className="w-24"
                    aria-label={`${skill.label} ${Math.round(skill.score)} percent`}
                  />
                  <span className="text-sm tabular-nums">
                    {Math.round(skill.score)}%
                  </span>
                </div>
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {CONFIDENCE_LABEL[skill.confidenceBand]}
              </TableCell>

              <TableCell>
                <TrendCell trend={skill.trend} />
              </TableCell>

              <TableCell className="text-sm tabular-nums text-muted-foreground">
                {skill.observations}
              </TableCell>

              <TableCell>
                <Badge
                  variant="outline"
                  className={cn("whitespace-nowrap", ACTION_STYLE[skill.action])}
                >
                  {SKILL_ACTION_LABEL[skill.action]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TrendCell({ trend }: { trend: number }) {
  if (Math.abs(trend) < 3) {
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        Steady
      </span>
    );
  }
  const up = trend > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-sm tabular-nums",
        up ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? "+" : ""}
      {Math.round(trend)}
    </span>
  );
}
