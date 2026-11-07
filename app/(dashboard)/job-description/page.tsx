import type { Metadata } from "next";
import Link from "next/link";
import { Target } from "lucide-react";

import { JdAnalyzerForm } from "@/components/job-description/jd-analyzer-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceNotice } from "@/components/shared/service-notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiAvailable } from "@/lib/ai";
import { aiKeyEnvHint } from "@/lib/env";
import { requireUserPage } from "@/lib/auth/session";
import { listJobDescriptions } from "@/lib/job-description/service";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Job matching",
  description: "Match a job description against your profile.",
};

export const dynamic = "force-dynamic";

export default async function JobDescriptionPage() {
  const user = await requireUserPage("/job-description");
  const history = await listJobDescriptions(user.id, 20);

  return (
    <>
      <PageHeader
        title="Job description matching"
        description="Paste a posting to see where you stand and what to study first."
      />

      {!aiAvailable() ? (
        <ServiceNotice
          title="Job matching needs an AI key"
          message="Analysing a job description against your profile requires an AI provider key on this deployment."
          envHint={aiKeyEnvHint()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <JdAnalyzerForm />

          <aside>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Previous analyses</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <EmptyState
                    icon={Target}
                    title="Nothing analysed yet"
                    description="Your analysed postings will be listed here so you can revisit the roadmap."
                    className="border-0 py-6"
                  />
                ) : (
                  <ul className="divide-y">
                    {history.map((jd) => (
                      <li key={jd.id}>
                        <Link
                          href={`/job-description/${jd.id}`}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {jd.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {jd.company ? `${jd.company} · ` : ""}
                              {formatDate(jd.createdAt)}
                            </p>
                          </div>
                          <Badge
                            variant={
                              jd.matchScore >= 75
                                ? "success"
                                : jd.matchScore >= 50
                                  ? "warning"
                                  : "destructive"
                            }
                          >
                            {jd.matchScore}%
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
