"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserRole } from "@prisma/client";

export function UserSearch({
  currentSearch,
  currentRole,
}: {
  currentSearch: string;
  currentRole?: UserRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentSearch);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters(search, currentRole);
  }

  function handleRoleChange(role: string) {
    const newRole = role === "" ? undefined : (role as UserRole);
    applyFilters(search, newRole);
  }

  function applyFilters(searchVal: string, role?: UserRole) {
    const params = new URLSearchParams();
    if (searchVal) params.set("search", searchVal);
    if (role) params.set("role", role);
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-4">
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </form>
      <select
        value={currentRole ?? ""}
        onChange={(e) => handleRoleChange(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        disabled={isPending}
      >
        <option value="">All Roles</option>
        {Object.values(UserRole).map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </div>
  );
}
