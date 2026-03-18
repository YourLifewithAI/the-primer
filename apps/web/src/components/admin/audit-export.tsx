"use client";

import { useState } from "react";

export function AuditExport({
  userId,
  action,
  startDate,
  endDate,
}: {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (action) params.set("action", action);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("pageSize", "10000"); // Export up to 10K records

      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) {
        alert("Failed to export audit logs");
        return;
      }

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.logs, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
    >
      {isExporting ? "Exporting..." : "Export JSON"}
    </button>
  );
}
