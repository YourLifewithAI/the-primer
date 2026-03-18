import { getAuditLogs } from "@/lib/admin-analytics";
import { AuditSearch } from "@/components/admin/audit-search";
import { AuditExport } from "@/components/admin/audit-export";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const userId = params.userId ?? undefined;
  const action = params.action ?? undefined;
  const startDate = params.startDate ? new Date(params.startDate) : undefined;
  const endDate = params.endDate ? new Date(params.endDate) : undefined;
  const page = parseInt(params.page ?? "1", 10);
  const pageSize = 50;

  const { logs, total } = await getAuditLogs({
    userId,
    action,
    startDate,
    endDate,
    page,
    pageSize,
  });
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">
            FERPA compliance — data access records
          </p>
        </div>
        <AuditExport
          userId={userId}
          action={action}
          startDate={params.startDate}
          endDate={params.endDate}
        />
      </div>

      <AuditSearch
        currentUserId={userId}
        currentAction={action}
        currentStartDate={params.startDate}
        currentEndDate={params.endDate}
      />

      <div className="text-xs text-muted-foreground mb-2">
        {total} record{total !== 1 ? "s" : ""} found
      </div>

      {logs.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
          <p>No audit records found.</p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Timestamp</th>
                  <th className="text-left px-4 py-2 font-medium">Accessor</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Details</th>
                  <th className="text-left px-4 py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {log.userId.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {log.studentId.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-2">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {log.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {page > 1 && (
                <Link
                  href={`/admin/audit?${buildQuery({ userId, action, startDate: params.startDate, endDate: params.endDate, page: page - 1 })}`}
                  className="px-3 py-1 text-sm border border-border rounded hover:bg-muted"
                >
                  Previous
                </Link>
              )}
              <span className="px-3 py-1 text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/admin/audit?${buildQuery({ userId, action, startDate: params.startDate, endDate: params.endDate, page: page + 1 })}`}
                  className="px-3 py-1 text-sm border border-border rounded hover:bg-muted"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    view_mastery: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    view_chat_log: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    view_overview: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    export: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    delete: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  const style = styles[action] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${style}`}>
      {action}
    </span>
  );
}

function buildQuery(params: {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.userId) sp.set("userId", params.userId);
  if (params.action) sp.set("action", params.action);
  if (params.startDate) sp.set("startDate", params.startDate);
  if (params.endDate) sp.set("endDate", params.endDate);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  return sp.toString();
}
