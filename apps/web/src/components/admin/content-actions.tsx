"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function ContentActions({
  contentId,
  contentType,
  currentStatus,
}: {
  contentId: string;
  contentType: "course" | "lesson";
  currentStatus: "published" | "draft" | "archived" | "flagged";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleAction(action: string) {
    const confirmed = window.confirm(
      `Are you sure you want to ${action} this ${contentType}?`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/admin/content/${contentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: contentType, action }),
    });

    if (res.ok) {
      startTransition(() => {
        router.refresh();
      });
    }
  }

  return (
    <div className="flex gap-1">
      {currentStatus !== "published" && (
        <button
          onClick={() => handleAction("publish")}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950 disabled:opacity-50"
        >
          Publish
        </button>
      )}
      {currentStatus === "published" && (
        <button
          onClick={() => handleAction("unpublish")}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Unpublish
        </button>
      )}
      {currentStatus !== "archived" && (
        <button
          onClick={() => handleAction("archive")}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950 disabled:opacity-50"
        >
          Archive
        </button>
      )}
    </div>
  );
}
