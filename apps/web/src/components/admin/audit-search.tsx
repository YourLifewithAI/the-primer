"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AuditSearch({
  currentUserId,
  currentAction,
  currentStartDate,
  currentEndDate,
}: {
  currentUserId?: string;
  currentAction?: string;
  currentStartDate?: string;
  currentEndDate?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState(currentUserId ?? "");
  const [action, setAction] = useState(currentAction ?? "");
  const [startDate, setStartDate] = useState(currentStartDate ?? "");
  const [endDate, setEndDate] = useState(currentEndDate ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters();
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (action) params.set("action", action);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    startTransition(() => {
      router.push(`/admin/audit?${params.toString()}`);
    });
  }

  function handleClear() {
    setUserId("");
    setAction("");
    setStartDate("");
    setEndDate("");
    startTransition(() => {
      router.push("/admin/audit");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 mb-4">
      <input
        type="text"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="Accessor user ID..."
        className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <select
        value={action}
        onChange={(e) => setAction(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
      >
        <option value="">All Actions</option>
        <option value="view_mastery">view_mastery</option>
        <option value="view_chat_log">view_chat_log</option>
        <option value="view_overview">view_overview</option>
        <option value="export">export</option>
        <option value="delete">delete</option>
      </select>
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        placeholder="Start date"
      />
      <input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        placeholder="End date"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
