"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api/client";

/**
 * Shown when the interview finished but the report could not be generated.
 *
 * The transcript and per-answer evaluations are already saved, so this is a
 * pure retry of the final AI call — nothing the user did is at risk.
 */
export function ReportRetry({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function retry() {
    setLoading(true);
    try {
      await apiPost(`/api/interviews/${interviewId}/complete`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Alert variant="warning">
      <RefreshCw aria-hidden="true" />
      <AlertTitle>We couldn&apos;t generate your report</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Your interview is saved — every question, answer and per-answer score
          is safe. Only the final summary failed. Try again.
        </p>
        <Button onClick={retry} loading={loading} size="sm">
          Generate report
        </Button>
      </AlertDescription>
    </Alert>
  );
}
