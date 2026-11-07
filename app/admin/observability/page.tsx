import type { Metadata } from "next";
import { Activity, AlertTriangle, Coins, Timer } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAiUsageSummary } from "@/lib/ai/observability";
import { requireAdminPage } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/audit/service";
import { humanizeEnum } from "@/lib/utils";

export const metadata: Metadata = {
  title: "AI observability",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function ObservabilityPage() {
  await requireAdminPage();

  const [usage, audit] = await Promise.all([
    getAiUsageSummary(WINDOW_DAYS),
    listAuditLogs({ page: 1, pageSize: 25 }),
  ]);

  return (
    <>
      <PageHeader
        title="AI observability"
        description={`Provider usage and the admin audit trail, last ${WINDOW_DAYS} days.`}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardDescription>
            Only metadata is recorded — provider, model, latency, token counts
            and error category. No prompt or completion text is ever stored, so
            nothing on this page can expose a user&apos;s answers.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI calls"
          value={usage.totalCalls}
          icon={Activity}
          hint={`${usage.successRate}% succeeded`}
        />
        <StatCard
          label="Average latency"
          value={`${usage.averageLatencyMs} ms`}
          icon={Timer}
          hint="Round trip, provider side"
        />
        <StatCard
          label="Input tokens"
          value={usage.totalInputTokens.toLocaleString()}
          icon={Coins}
          hint="Billable input"
        />
        <StatCard
          label="Output tokens"
          value={usage.totalOutputTokens.toLocaleString()}
          icon={Coins}
          hint="Billable output"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage by feature</CardTitle>
          <CardDescription>
            Where the API budget is actually going.
          </CardDescription>
        </CardHeader>
        <CardContent className={usage.byFeature.length === 0 ? undefined : "px-0"}>
          {usage.byFeature.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No AI calls recorded"
              description="Usage appears here once an AI feature runs. Nothing is pre-populated."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="w-[100px]">Calls</TableHead>
                    <TableHead className="w-[110px]">Failures</TableHead>
                    <TableHead className="w-[140px]">Avg latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.byFeature.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="font-medium">
                        {humanizeEnum(row.feature)}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.calls}</TableCell>
                      <TableCell>
                        {row.failures === 0 ? (
                          <span className="text-sm text-muted-foreground">0</span>
                        ) : (
                          <Badge variant="destructive">{row.failures}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.averageLatencyMs} ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {usage.recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle
                className="h-4 w-4 text-destructive"
                aria-hidden="true"
              />
              Recent failures
            </CardTitle>
            <CardDescription>
              Error categories, not error messages — messages can echo user
              input.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {usage.recentFailures.map((failure, index) => (
                <li
                  key={`${failure.feature}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium">
                    {humanizeEnum(failure.feature)}
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge variant="outline">
                      {failure.errorCategory ?? "unknown"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {failure.createdAt.toLocaleString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>
            Every role change, question edit and review decision. Append-only.
          </CardDescription>
        </CardHeader>
        <CardContent className={audit.items.length === 0 ? undefined : "px-0"}>
          {audit.items.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No admin actions logged"
              description="Sensitive admin actions are recorded here as they happen."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {log.createdAt.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">{log.actorEmail}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.targetType}
                        {log.targetId && ` · ${log.targetId.slice(0, 8)}…`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
