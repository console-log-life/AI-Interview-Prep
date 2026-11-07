"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api/client";

type StartAssessmentButtonProps = {
  assessmentId: string;
  label?: string;
  className?: string;
};

export function StartAssessmentButton({
  assessmentId,
  label = "Start",
  className,
}: StartAssessmentButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const { attemptId } = await apiPost<{ attemptId: string }>(
        `/api/assessments/${assessmentId}/start`,
      );
      router.push(`/assessments/${attemptId}`);
    } catch (error) {
      setLoading(false);
      toast.error(errorMessage(error));
    }
  }

  return (
    <Button onClick={start} loading={loading} size="sm" className={className}>
      <Play aria-hidden="true" />
      {label}
    </Button>
  );
}
