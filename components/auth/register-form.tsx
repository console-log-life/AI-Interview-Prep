"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Check } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, errorMessage, ApiClientError } from "@/lib/api/client";
import { registerSchema } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

const RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "A lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "An uppercase letter" },
  { test: (v: string) => /[0-9]/.test(v), label: "A number" },
];

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    };

    // Client-side validation is a convenience only — the identical schema runs
    // again on the server, which is the real gate.
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      try {
        await apiPost("/api/auth/register", parsed.data);

        const result = await signIn("credentials", {
          email: parsed.data.email,
          password: parsed.data.password,
          redirect: false,
        });

        if (!result || result.error) {
          // Account exists but auto sign-in failed — send them to sign in.
          router.push("/login?registered=1");
          return;
        }

        router.push("/profile?welcome=1");
        router.refresh();
      } catch (error) {
        if (error instanceof ApiClientError && error.fields) {
          setFieldErrors(error.fields);
        }
        setFormError(errorMessage(error));
      }
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-title font-bold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Start practising in under five minutes.
        </p>
      </div>

      {formError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            placeholder="Aarav Sharma"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            disabled={pending}
          />
          {fieldErrors.name && (
            <p id="name-error" className="text-sm text-destructive">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@college.edu"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            disabled={pending}
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-sm text-destructive">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby="password-rules"
            disabled={pending}
          />
          <ul id="password-rules" className="mt-2 space-y-1">
            {RULES.map((rule) => {
              const met = rule.test(password);
              return (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    met ? "text-success" : "text-muted-foreground",
                  )}
                >
                  <Check
                    className={cn("h-3 w-3", met ? "opacity-100" : "opacity-30")}
                    aria-hidden="true"
                  />
                  {/* Status is spelled out, not conveyed by colour alone. */}
                  <span>
                    {rule.label}
                    <span className="sr-only">{met ? " — met" : " — not met"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {fieldErrors.password && (
            <p className="text-sm text-destructive">{fieldErrors.password}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={
              fieldErrors.confirmPassword ? "confirm-error" : undefined
            }
            disabled={pending}
          />
          {fieldErrors.confirmPassword && (
            <p id="confirm-error" className="text-sm text-destructive">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
