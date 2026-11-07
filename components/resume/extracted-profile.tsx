"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

import { TagInput } from "@/components/shared/tag-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, errorMessage } from "@/lib/api/client";

export type ExtractedProfileData = {
  fullName: string;
  email: string;
  phone: string;
  summary: string;
  yearsExperience: number;
  skills: string[];
  technologies: string[];
  certifications: string[];
  achievements: string[];
  education: Array<{
    degree: string;
    institution: string;
    year: string;
    score: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
  }>;
  experience: Array<{
    role: string;
    organisation: string;
    duration: string;
    description: string;
  }>;
  internships: Array<{
    role: string;
    organisation: string;
    duration: string;
    description: string;
  }>;
  strengths: string[];
  gaps: string[];
  userVerified: boolean;
};

/**
 * The AI's extraction, rendered as an editable form.
 *
 * This is the "never blindly trust AI extraction" requirement made concrete:
 * every extracted field is a real input the user can correct, and saving marks
 * the record as human-verified.
 */
export function ExtractedProfile({
  resumeId,
  data,
}: {
  resumeId: string;
  data: ExtractedProfileData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(data);

  function set<K extends keyof ExtractedProfileData>(
    key: K,
    value: ExtractedProfileData[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await apiPatch(`/api/resume/${resumeId}`, {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone,
          summary: values.summary,
          yearsExperience: values.yearsExperience,
          skills: values.skills,
          technologies: values.technologies,
          certifications: values.certifications,
          achievements: values.achievements,
          education: values.education,
          projects: values.projects,
          experience: values.experience,
          internships: values.internships,
        });
        toast.success("Extracted profile saved and marked as reviewed.");
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {values.userVerified ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>You&apos;ve reviewed this extraction</AlertTitle>
          <AlertDescription>
            These details are treated as correct and used to tailor your
            interviews.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <ShieldQuestion aria-hidden="true" />
          <AlertTitle>Check this before you rely on it</AlertTitle>
          <AlertDescription>
            This was extracted automatically from your PDF and may contain
            mistakes. Correct anything that&apos;s wrong and save — your version
            wins over the AI&apos;s.
          </AlertDescription>
        </Alert>
      )}

      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle className="type-card-title">Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ex-name">Full name</Label>
            <Input
              id="ex-name"
              value={values.fullName}
              onChange={(event) => set("fullName", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-email">Email on resume</Label>
            <Input
              id="ex-email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-phone">Phone</Label>
            <Input
              id="ex-phone"
              value={values.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-years">Years of professional experience</Label>
            <Input
              id="ex-years"
              type="number"
              min={0}
              max={60}
              step="0.5"
              value={values.yearsExperience}
              onChange={(event) =>
                set("yearsExperience", Number(event.target.value) || 0)
              }
            />
            <p className="text-xs text-muted-foreground">
              Internships and college projects don&apos;t count here.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ex-summary">Summary</Label>
            <Textarea
              id="ex-summary"
              rows={3}
              value={values.summary}
              onChange={(event) => set("summary", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle className="type-card-title">Skills and technologies</CardTitle>
          <CardDescription>
            These feed straight into your interview questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ex-skills">Skills</Label>
            <TagInput
              id="ex-skills"
              value={values.skills}
              onChange={(next) => set("skills", next)}
              max={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-tech">Technologies</Label>
            <TagInput
              id="ex-tech"
              value={values.technologies}
              onChange={(next) => set("technologies", next)}
              max={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-certs">Certifications</Label>
            <TagInput
              id="ex-certs"
              value={values.certifications}
              onChange={(next) => set("certifications", next)}
              max={30}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-achievements">Achievements</Label>
            <TagInput
              id="ex-achievements"
              value={values.achievements}
              onChange={(next) => set("achievements", next)}
              max={30}
            />
          </div>
        </CardContent>
      </Card>

      {values.education.length > 0 && (
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Education</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {values.education.map((entry, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label htmlFor={`edu-degree-${index}`}>Degree</Label>
                  <Input
                    id={`edu-degree-${index}`}
                    value={entry.degree}
                    onChange={(event) => {
                      const next = [...values.education];
                      next[index] = { ...entry, degree: event.target.value };
                      set("education", next);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edu-inst-${index}`}>Institution</Label>
                  <Input
                    id={`edu-inst-${index}`}
                    value={entry.institution}
                    onChange={(event) => {
                      const next = [...values.education];
                      next[index] = { ...entry, institution: event.target.value };
                      set("education", next);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edu-year-${index}`}>Year</Label>
                  <Input
                    id={`edu-year-${index}`}
                    value={entry.year}
                    onChange={(event) => {
                      const next = [...values.education];
                      next[index] = { ...entry, year: event.target.value };
                      set("education", next);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edu-score-${index}`}>Score</Label>
                  <Input
                    id={`edu-score-${index}`}
                    value={entry.score}
                    onChange={(event) => {
                      const next = [...values.education];
                      next[index] = { ...entry, score: event.target.value };
                      set("education", next);
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {values.projects.length > 0 && (
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {values.projects.map((project, index) => (
              <div key={index} className="space-y-3 rounded-lg border p-4">
                <div className="space-y-2">
                  <Label htmlFor={`proj-name-${index}`}>Name</Label>
                  <Input
                    id={`proj-name-${index}`}
                    value={project.name}
                    onChange={(event) => {
                      const next = [...values.projects];
                      next[index] = { ...project, name: event.target.value };
                      set("projects", next);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`proj-desc-${index}`}>Description</Label>
                  <Textarea
                    id={`proj-desc-${index}`}
                    rows={2}
                    value={project.description}
                    onChange={(event) => {
                      const next = [...values.projects];
                      next[index] = {
                        ...project,
                        description: event.target.value,
                      };
                      set("projects", next);
                    }}
                  />
                </div>
                {project.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {project.technologies.map((tech) => (
                      <Badge key={tech} variant="secondary">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(values.strengths.length > 0 || values.gaps.length > 0) && (
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">
              How this resume reads to a recruiter
            </CardTitle>
            <CardDescription>
              An assessment of the document, not of you.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-success">
                Working well
              </h3>
              <ul className="mt-2 space-y-1.5">
                {values.strengths.map((item, index) => (
                  <li
                    key={index}
                    className="text-sm text-muted-foreground text-pretty"
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warning">
                Could be clearer
              </h3>
              <ul className="mt-2 space-y-1.5">
                {values.gaps.map((item, index) => (
                  <li
                    key={index}
                    className="text-sm text-muted-foreground text-pretty"
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={pending} size="lg">
          <Save aria-hidden="true" />
          Save corrections
        </Button>
      </div>
    </form>
  );
}
