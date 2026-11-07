"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, FileText, MessagesSquare, Target, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPost, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  INTERVIEW_TYPE_DESCRIPTIONS,
  INTERVIEW_TYPE_LABELS,
  PERSONA_DESCRIPTIONS,
  PERSONA_LABELS,
  type InterviewType,
  type InterviewerPersona,
} from "@/types/interview";
import { EXPERIENCE_LEVEL_LABELS, type ExperienceLevel } from "@/types/user";

type InterviewSetupProps = {
  defaultRole: string;
  defaultExperience: ExperienceLevel;
  hasResume: boolean;
  jobDescriptions: Array<{ id: string; title: string; company: string | null }>;
  presetType?: string;
  presetDifficulty?: string;
  presetJobDescriptionId?: string;
  /** Whether this deployment can actually run a realtime voice interview. */
  liveAvailable: boolean;
};

/**
 * The two experiences.
 *
 * Kept as an explicit, first choice rather than a toggle discovered later,
 * because they are not two skins on one thing: one is typing practice you can
 * do in ten minutes on a train, the other opens your camera and microphone and
 * asks you to behave as though it were real.
 */
type InterviewMode = "CHAT" | "MOCK";

const TYPES = Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[];
const PERSONAS = Object.keys(PERSONA_LABELS) as InterviewerPersona[];
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export function InterviewSetup({
  defaultRole,
  defaultExperience,
  hasResume,
  jobDescriptions,
  presetType,
  presetDifficulty,
  presetJobDescriptionId,
  liveAvailable,
}: InterviewSetupProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<InterviewMode>(liveAvailable ? "MOCK" : "CHAT");

  const [targetRole, setTargetRole] = useState(defaultRole);
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>(defaultExperience);
  const [type, setType] = useState<InterviewType>(
    TYPES.includes(presetType as InterviewType)
      ? (presetType as InterviewType)
      : "MIXED",
  );
  const [persona, setPersona] = useState<InterviewerPersona>("PROFESSIONAL");
  const [difficulty, setDifficulty] = useState<string>(
    DIFFICULTIES.includes(presetDifficulty as (typeof DIFFICULTIES)[number])
      ? presetDifficulty!
      : "MEDIUM",
  );
  const [durationMin, setDurationMin] = useState("20");
  const [plannedQuestions, setPlannedQuestions] = useState("6");
  const [useResume, setUseResume] = useState(hasResume);
  // Arriving from a job-description result page preselects that posting, but
  // only if it is actually one of the user's own analyses.
  const [jobDescriptionId, setJobDescriptionId] = useState(
    presetJobDescriptionId &&
      jobDescriptions.some((jd) => jd.id === presetJobDescriptionId)
      ? presetJobDescriptionId
      : "NONE",
  );

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!targetRole.trim()) {
      toast.error("Enter the role you're interviewing for.");
      return;
    }

    setLoading(true);
    try {
      const { interviewId } = await apiPost<{ interviewId: string }>(
        "/api/interviews",
        {
          targetRole: targetRole.trim(),
          experienceLevel,
          type,
          persona,
          difficulty,
          durationMin: Number(durationMin),
          plannedQuestions: Number(plannedQuestions),
          useResume,
          jobDescriptionId:
            jobDescriptionId === "NONE" ? undefined : jobDescriptionId,
        },
      );
      // Mock interviews go through the device check; nothing opens a camera
      // without the candidate passing that screen first.
      router.push(
        mode === "MOCK"
          ? `/interview/${interviewId}/check`
          : `/interview/${interviewId}`,
      );
    } catch (error) {
      setLoading(false);
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={start} className="space-y-6">
      {/* Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How do you want to practise?</CardTitle>
          <CardDescription>
            Both produce a scored report. Only one of them asks you to speak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset>
            <legend className="sr-only">Interview format</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeOption
                value="CHAT"
                checked={mode === "CHAT"}
                onSelect={setMode}
                icon={MessagesSquare}
                title="Chat interview"
                description="Type your answers. Quick daily practice — no camera, no microphone."
              />
              <ModeOption
                value="MOCK"
                checked={mode === "MOCK"}
                onSelect={setMode}
                icon={Video}
                title="Mock interview"
                description={
                  liveAvailable
                    ? "Camera and voice, like a real remote interview. Includes delivery feedback."
                    : "Unavailable — this deployment has no realtime voice provider configured."
                }
                disabled={!liveAvailable}
              />
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who is being interviewed</CardTitle>
          <CardDescription>
            The interviewer tailors every question to these.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="targetRole">Target role</Label>
            <Input
              id="targetRole"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder="e.g. Backend Engineer"
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="experience">Experience level</Label>
            <Select
              value={experienceLevel}
              onValueChange={(value) =>
                setExperienceLevel(value as ExperienceLevel)
              }
            >
              <SelectTrigger id="experience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPERIENCE_LEVEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Round type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Round type</CardTitle>
          <CardDescription>What kind of interview is this?</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset>
            <legend className="sr-only">Interview round type</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TYPES.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    type === value && "border-primary bg-accent",
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-medium">
                    {INTERVIEW_TYPE_LABELS[value]}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground text-pretty">
                    {INTERVIEW_TYPE_DESCRIPTIONS[value]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Interviewer personality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interviewer personality</CardTitle>
          <CardDescription>
            Affects tone and how hard they press. Never abusive or personal,
            whichever you pick.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset>
            <legend className="sr-only">Interviewer personality</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {PERSONAS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    persona === value && "border-primary bg-accent",
                  )}
                >
                  <input
                    type="radio"
                    name="persona"
                    value={value}
                    checked={persona === value}
                    onChange={() => setPersona(value)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {PERSONA_LABELS[value]}
                    {value === "STRESS" && (
                      <Badge variant="warning">Advanced</Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground text-pretty">
                    {PERSONA_DESCRIPTIONS[value]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Format + context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Format and context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="questions">Questions</Label>
              <Input
                id="questions"
                type="number"
                min={3}
                max={20}
                value={plannedQuestions}
                onChange={(event) => setPlannedQuestions(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Target duration (min)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={90}
                value={durationMin}
                onChange={(event) => setDurationMin(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <label
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4",
                !hasResume && "opacity-60",
              )}
            >
              <Checkbox
                checked={useResume}
                onCheckedChange={(value) => setUseResume(value === true)}
                disabled={!hasResume}
                className="mt-0.5"
                aria-describedby="resume-hint"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Use my resume
                </span>
                <span
                  id="resume-hint"
                  className="mt-1 block text-xs text-muted-foreground"
                >
                  {hasResume
                    ? "Questions will reference your actual projects and skills."
                    : "Upload and analyse a resume first to enable this."}
                </span>
              </span>
            </label>

            <div className="space-y-2">
              <Label htmlFor="jd" className="flex items-center gap-2">
                <Target className="h-4 w-4" aria-hidden="true" />
                Target a job description
              </Label>
              <Select
                value={jobDescriptionId}
                onValueChange={setJobDescriptionId}
              >
                <SelectTrigger id="jd">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {jobDescriptions.map((jd) => (
                    <SelectItem key={jd.id} value={jd.id}>
                      {jd.title}
                      {jd.company ? ` · ${jd.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {jobDescriptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Analyse a job posting first and it will appear here.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" loading={loading} className="w-full">
        <Bot aria-hidden="true" />
        {mode === "MOCK" ? "Continue to device check" : "Start chat interview"}
      </Button>
    </form>
  );
}

function ModeOption({
  value,
  checked,
  onSelect,
  icon: Icon,
  title,
  description,
  disabled = false,
}: {
  value: InterviewMode;
  checked: boolean;
  onSelect: (mode: InterviewMode) => void;
  icon: typeof Bot;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked && "border-primary bg-accent",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
      )}
    >
      <input
        type="radio"
        name="mode"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </span>
      <span className="mt-1 block text-pretty text-xs text-muted-foreground">
        {description}
      </span>
    </label>
  );
}
