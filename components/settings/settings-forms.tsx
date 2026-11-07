"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiFetch, apiPost, errorMessage } from "@/lib/api/client";
import { changePasswordSchema } from "@/lib/validation/auth";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    startTransition(async () => {
      try {
        await apiPost("/api/settings/password", parsed.data);
        toast.success("Password changed.");
        form.reset();
      } catch (error) {
        if (error instanceof ApiClientError && error.fields) {
          setErrors(error.fields);
        }
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Change password
        </CardTitle>
        <CardDescription>
          You&apos;ll need your current password even though you&apos;re signed
          in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="max-w-sm space-y-4">
          {(
            [
              ["currentPassword", "Current password", "current-password"],
              ["newPassword", "New password", "new-password"],
              ["confirmPassword", "Confirm new password", "new-password"],
            ] as const
          ).map(([name, label, autoComplete]) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={name}>{label}</Label>
              <Input
                id={name}
                name={name}
                type="password"
                autoComplete={autoComplete}
                required
                aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
              />
              {errors[name] && (
                <p id={`${name}-error`} className="text-sm text-destructive">
                  {errors[name]}
                </p>
              )}
            </div>
          ))}

          <Button type="submit" loading={pending}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function remove() {
    startTransition(async () => {
      try {
        await apiFetch("/api/settings/account", {
          method: "DELETE",
          body: JSON.stringify({ password, confirm }),
        });
        toast.success("Your account has been deleted.");
        await signOut({ callbackUrl: "/" });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete account
          </CardTitle>
          <CardDescription>
            Permanently removes your profile, resumes, interviews, assessments,
            submissions and progress. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Everything is removed immediately and cannot be recovered. Confirm
              with your password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Your password</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-semibold">DELETE</span> to
                confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              loading={pending}
              disabled={confirm !== "DELETE" || !password}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
