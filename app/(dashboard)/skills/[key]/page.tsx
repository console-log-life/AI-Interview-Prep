import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SkillDetailView } from "@/components/skills/skill-detail-view";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth/session";
import { getSkillDetail } from "@/lib/skills/detail";
import { humanizeEnum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  return { title: `Skill · ${decodeURIComponent(key)}` };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const user = await requireUserPage();
  const { key } = await params;

  // Throws NotFoundError for a key outside the graph, which the route's
  // error boundary renders — an arbitrary key cannot probe the database.
  const detail = await getSkillDetail(user.id, decodeURIComponent(key));

  return (
    <>
      <PageHeader
        title={detail.label}
        description={
          detail.description ??
          `Everything measured about your ${detail.label.toLowerCase()}.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{humanizeEnum(detail.category)}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/skills">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                All skills
              </Link>
            </Button>
          </div>
        }
      />

      {detail.ancestors.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Part of{" "}
          {detail.ancestors.map((ancestor, index) => (
            <span key={ancestor.skillKey}>
              {index > 0 && " › "}
              <Link
                href={`/skills/${encodeURIComponent(ancestor.skillKey)}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {ancestor.label}
              </Link>
            </span>
          ))}
        </p>
      )}

      <SkillDetailView detail={detail} />
    </>
  );
}
