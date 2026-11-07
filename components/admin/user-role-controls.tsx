"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPatch, errorMessage } from "@/lib/api/client";

/**
 * Role / status switcher.
 *
 * The self-modification guard lives on the server (`/api/admin/users/[id]`);
 * the parent simply doesn't render this control for the current admin.
 */
export function UserRoleControls({
  userId,
  role,
  isActive,
}: {
  userId: string;
  role: "STUDENT" | "ADMIN";
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(patch: { role?: "STUDENT" | "ADMIN"; isActive?: boolean }) {
    startTransition(async () => {
      try {
        await apiPatch(`/api/admin/users/${userId}`, patch);
        toast.success("User updated.");
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={role}
        onValueChange={(value) =>
          update({ role: value as "STUDENT" | "ADMIN" })
        }
        disabled={pending}
      >
        <SelectTrigger className="h-8 w-[110px]" aria-label="User role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="STUDENT">Student</SelectItem>
          <SelectItem value="ADMIN">Admin</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={isActive ? "active" : "suspended"}
        onValueChange={(value) => update({ isActive: value === "active" })}
        disabled={pending}
      >
        <SelectTrigger className="h-8 w-[120px]" aria-label="Account status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
