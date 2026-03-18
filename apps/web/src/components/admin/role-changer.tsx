"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@prisma/client";

export function RoleChanger({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: UserRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(newRole: string) {
    if (newRole === currentRole) return;

    setError(null);

    const confirmed = window.confirm(
      `Change this user's role from ${currentRole} to ${newRole}?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update role");
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={currentRole}
        onChange={(e) => handleRoleChange(e.target.value)}
        disabled={isPending}
        className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
      >
        {Object.values(UserRole).map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
