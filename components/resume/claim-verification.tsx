"use client";

import { useState } from "react";
import type { ClaimStatus } from "@prisma/client";
import { AlertCircle, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiPost, errorMessage } from "@/lib/api/client";
import { CLAIM_STATUS_LABEL } from "@/lib/resume/claim-labels";
import { cn } from "@/lib/utils";

export type ClaimView = {
  id: string;
  claimType: string;
  text: string;
  technologies: string[];
  probes: string[];
  status: ClaimStatus;
  evidence: string | null;
  understanding: number | null;
};

const STATUS_STYLE: Record<ClaimStatus, string> = {
  UNVERIFIED: "border-muted-foreground/30 text-muted-foreground",
  VERIFIED: "border-success/40 bg-success/10 text-success",
  PARTIAL: "border-warning/40 bg-warning/10 text-warning-foreground",
  UNCLEAR: "border-warning/40 bg-warning/10 text-warning-foreground",
  WEAK: "border-destructive/30 bg-destructive/10 text-destructive",
};

/**
 * Resume claim verification.
 *
 * A claim only changes status when a real interview answer has tested it —
 * there is no way to mark something "verified" from this screen, because that
 * would make the badge meaningless.
 */
export function ClaimVerification({
  resumeId,
  claims: initialClaims,
  aiEnabled,
}: {
  resumeId: string;
  claims: ClaimView[];
  aiEnabled: boolean;
}) {
  const [claims, setClaims] = useState(initialClaims);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verified = claims.filter((claim) => claim.status === "VERIFIED").length;
  const tested = claims.filter((claim) => claim.status !== "UNVERIFIED").length;
  const percent = claims.length ? Math.round((tested / claims.length) * 100) : 0;

  async function extract() {
    setExtracting(true);
    setError(null);
    try {
      const result = await apiPost<{ count: number; claims: ClaimView[] }>(
        `/api/resume/${resumeId}/claims`,
      );
      setClaims(result.claims);
      toast.success(
        `${result.count} claim${result.count === 1 ? "" : "s"} extracted. Your next interview will probe them.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setExtracting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Claim verification</CardTitle>
            <CardDescription>
              What your resume asserts, and whether you have actually explained
              it in an interview.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!aiEnabled || extracting}
            onClick={() => void extract()}
          >
            {extracting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanSearch className="h-4 w-4" aria-hidden="true" />
            )}
            {claims.length > 0 ? "Re-extract claims" : "Extract claims"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!aiEnabled && (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
              Claim extraction needs an Anthropic API key. Existing claims are
              still shown and still get verified during interviews.
            </AlertDescription>
          </Alert>
        )}

        {claims.length === 0 ? (
          <EmptyState
            icon={ScanSearch}
            title="No claims extracted yet"
            description="Extract them and your next mock interview will ask about your real projects and experience instead of generic topics."
          />
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Discussed in an interview
                </span>
                <span className="font-medium tabular-nums">
                  {tested} of {claims.length} · {verified} explained well
                </span>
              </div>
              <Progress
                value={percent}
                aria-label={`${percent} percent of claims discussed`}
              />
            </div>

            <ul className="space-y-3">
              {claims.map((claim) => (
                <li key={claim.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-pretty text-sm font-medium">
                      {claim.text}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0", STATUS_STYLE[claim.status])}
                    >
                      {CLAIM_STATUS_LABEL[claim.status]}
                    </Badge>
                  </div>

                  {claim.technologies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {claim.technologies.map((technology) => (
                        <Badge key={technology} variant="secondary">
                          {technology}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {claim.evidence && (
                    <p className="mt-2 text-pretty text-xs text-muted-foreground">
                      <span className="font-medium">From your interview: </span>
                      {claim.evidence}
                    </p>
                  )}

                  {claim.status === "UNVERIFIED" && claim.probes.length > 0 && (
                    <p className="mt-2 text-pretty text-xs text-muted-foreground">
                      <span className="font-medium">Expect to be asked: </span>
                      {claim.probes[0]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
