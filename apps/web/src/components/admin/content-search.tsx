"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ContentSearch({
  currentSearch,
  currentType,
}: {
  currentSearch: string;
  currentType?: "course" | "lesson";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentSearch);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters(search, currentType);
  }

  function handleTypeChange(type: string) {
    const newType = type === "" ? undefined : (type as "course" | "lesson");
    applyFilters(search, newType);
  }

  function applyFilters(searchVal: string, type?: "course" | "lesson") {
    const params = new URLSearchParams();
    if (searchVal) params.set("search", searchVal);
    if (type) params.set("type", type);
    startTransition(() => {
      router.push(`/admin/content?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-4">
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search content by title..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </form>
      <select
        value={currentType ?? ""}
        onChange={(e) => handleTypeChange(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        disabled={isPending}
      >
        <option value="">All Types</option>
        <option value="course">Courses</option>
        <option value="lesson">Lessons</option>
      </select>
    </div>
  );
}
