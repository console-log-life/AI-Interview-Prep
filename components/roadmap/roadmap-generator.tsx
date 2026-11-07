"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPost, errorMessage } from "@/lib/api/client";

const HORIZONS = [7, 14, 30, 60, 90] as const;
const MINUTES = [30, 45, 60, 90, 120] as const;

/**
 * Generating a roadmap replaces the previous active one, so the button says so
 * before it is pressed rather than after.
 */
export function RoadmapGenerator({
  aiEnabled,
  hasActive,
}: {
  aiEnabled: boolean;
  hasActive: boolean;
}) {
  const router = useRouter();
  const [horizonDays, setHorizonDays] = useState<string>("14");
  const [minutesPerDay, setMinutesPerDay] = useState<string>("60");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      await apiPost("/api/roadmap/generate", {
        horizonDays: Number(horizonDays),
        minutesPerDay: Number(minutesPerDay),
      });
      toast.success("Roadmap ready.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="horizon">Horizon</Label>
        <Select
          value={horizonDays}
          onValueChange={setHorizonDays}
          disabled={!aiEnabled || generating}
        >
          <SelectTrigger id="horizon" className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZONS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="minutes">Time per day</Label>
        <Select
          value={minutesPerDay}
          onValueChange={setMinutesPerDay}
          disabled={!aiEnabled || generating}
        >
          <SelectTrigger id="minutes" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {minutes} minutes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={() => void generate()}
        disabled={!aiEnabled || generating}
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Wand2 className="h-4 w-4" aria-hidden="true" />
        )}
        {hasActive ? "Replace roadmap" : "Generate roadmap"}
      </Button>
    </div>
  );
}
