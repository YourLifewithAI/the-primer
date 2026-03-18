"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddStudentForm({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/guide/classrooms/${classroomId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add student");
      }

      setMessage({
        type: "success",
        text: data.message ?? "Student added successfully",
      });
      setEmail("");
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-primary hover:underline cursor-pointer"
      >
        + Add Student
      </button>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Add Student by Email</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@example.com"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </form>
      {message && (
        <div
          className={`text-sm mt-2 ${
            message.type === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
