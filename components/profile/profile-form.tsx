"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";

import { TagInput } from "@/components/shared/tag-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api/client";
import { profileSchema } from "@/lib/validation/profile";
import {
  EXPERIENCE_LEVEL_LABELS,
  LANGUAGE_LABELS,
  type CodeLanguage,
  type ExperienceLevel,
} from "@/types/user";

type ProfileFormValues = {
  name: string;
  email: string;
  headline: string;
  bio: string;
  college: string;
  degree: string;
  branch: string;
  graduationYear?: number;
  cgpa?: number;
  experienceLevel: ExperienceLevel;
  targetRole: string;
  targetCompanies: string[];
  preferredLangs: CodeLanguage[];
  skills: string[];
  location: string;
  phone: string;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function set<K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function toggleLanguage(language: CodeLanguage, checked: boolean) {
    set(
      "preferredLangs",
      checked
        ? [...values.preferredLangs, language]
        : values.preferredLangs.filter((entry) => entry !== language),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = profileSchema.safeParse({
      ...values,
      graduationYear: values.graduationYear ?? "",
      cgpa: values.cgpa ?? "",
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Some fields need attention.");
      return;
    }

    startTransition(async () => {
      try {
        await apiFetch("/api/profile", {
          method: "PUT",
          body: JSON.stringify(parsed.data),
        });
        toast.success("Profile saved.");
        router.refresh();
      } catch (error) {
        if (error instanceof ApiClientError && error.fields) {
          setErrors(error.fields);
        }
        setFormError(errorMessage(error));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About you</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
              required
            />
            <FieldError id="name-error" message={errors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={values.email} disabled readOnly />
            <p className="text-xs text-muted-foreground">
              Your sign-in email can&apos;t be changed here.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              value={values.headline}
              onChange={(event) => set("headline", event.target.value)}
              placeholder="Final-year CSE student · Backend & distributed systems"
              maxLength={120}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bio">Short bio</Label>
            <Textarea
              id="bio"
              value={values.bio}
              onChange={(event) => set("bio", event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="A couple of lines about what you build and what you're aiming for."
            />
          </div>
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Education</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="college">College / University</Label>
            <Input
              id="college"
              value={values.college}
              onChange={(event) => set("college", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="degree">Degree</Label>
            <Input
              id="degree"
              value={values.degree}
              onChange={(event) => set("degree", event.target.value)}
              placeholder="B.Tech"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch">Branch / Major</Label>
            <Input
              id="branch"
              value={values.branch}
              onChange={(event) => set("branch", event.target.value)}
              placeholder="Computer Science"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="graduationYear">Graduation year</Label>
              <Input
                id="graduationYear"
                type="number"
                value={values.graduationYear ?? ""}
                onChange={(event) =>
                  set(
                    "graduationYear",
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
                aria-invalid={Boolean(errors.graduationYear)}
                aria-describedby={
                  errors.graduationYear ? "gradyear-error" : undefined
                }
              />
              <FieldError id="gradyear-error" message={errors.graduationYear} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cgpa">CGPA</Label>
              <Input
                id="cgpa"
                type="number"
                step="0.01"
                min={0}
                max={10}
                value={values.cgpa ?? ""}
                onChange={(event) =>
                  set(
                    "cgpa",
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
                aria-invalid={Boolean(errors.cgpa)}
                aria-describedby={errors.cgpa ? "cgpa-error" : undefined}
              />
              <FieldError id="cgpa-error" message={errors.cgpa} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Career target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you&apos;re aiming for</CardTitle>
          <CardDescription>
            These drive the questions you get asked and what we recommend.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="targetRole">Target role</Label>
            <Input
              id="targetRole"
              value={values.targetRole}
              onChange={(event) => set("targetRole", event.target.value)}
              placeholder="Backend Engineer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="experienceLevel">Experience level</Label>
            <Select
              value={values.experienceLevel}
              onValueChange={(value) =>
                set("experienceLevel", value as ExperienceLevel)
              }
            >
              <SelectTrigger id="experienceLevel">
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

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="skills">Skills</Label>
            <TagInput
              id="skills"
              value={values.skills}
              onChange={(next) => set("skills", next)}
              placeholder="Type a skill and press Enter"
              describedBy="skills-hint"
              max={50}
            />
            <p id="skills-hint" className="text-xs text-muted-foreground">
              Press Enter or type a comma to add. Used to tailor interview
              questions and match job descriptions.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="targetCompanies">Target companies</Label>
            <TagInput
              id="targetCompanies"
              value={values.targetCompanies}
              onChange={(next) => set("targetCompanies", next)}
              placeholder="Type a company and press Enter"
              max={15}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium">
              Preferred programming languages
            </span>
            <fieldset className="mt-2 flex flex-wrap gap-4">
              <legend className="sr-only">Preferred programming languages</legend>
              {(
                Object.keys(LANGUAGE_LABELS) as CodeLanguage[]
              ).map((language) => (
                <label
                  key={language}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={values.preferredLangs.includes(language)}
                    onCheckedChange={(checked) =>
                      toggleLanguage(language, checked === true)
                    }
                  />
                  {LANGUAGE_LABELS[language]}
                </label>
              ))}
            </fieldset>
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact and links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={values.location}
              onChange={(event) => set("location", event.target.value)}
              placeholder="Gwalior, India"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={values.phone}
              onChange={(event) => set("phone", event.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "phone-error" : undefined}
            />
            <FieldError id="phone-error" message={errors.phone} />
          </div>
          {(
            [
              ["githubUrl", "GitHub", "https://github.com/username"],
              ["linkedinUrl", "LinkedIn", "https://linkedin.com/in/username"],
              ["portfolioUrl", "Portfolio", "https://yoursite.dev"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="url"
                value={values[key]}
                onChange={(event) => set(key, event.target.value)}
                placeholder={placeholder}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={errors[key] ? `${key}-error` : undefined}
              />
              <FieldError id={`${key}-error`} message={errors[key]} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={pending} size="lg">
          <Save aria-hidden="true" />
          Save profile
        </Button>
      </div>
    </form>
  );
}
