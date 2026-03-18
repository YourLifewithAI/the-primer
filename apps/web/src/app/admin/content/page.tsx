import { getContentList } from "@/lib/admin-analytics";
import { ContentSearch } from "@/components/admin/content-search";
import { ContentActions } from "@/components/admin/content-actions";

export const dynamic = "force-dynamic";

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? "";
  const typeParam = params.type;
  const type = typeParam === "course" || typeParam === "lesson" ? typeParam : undefined;
  const page = parseInt(params.page ?? "1", 10);
  const pageSize = 25;

  const { items, total } = await getContentList({ search, type, page, pageSize });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Content Moderation</h2>
        <span className="text-sm text-muted-foreground">
          {total} item{total !== 1 ? "s" : ""} total
        </span>
      </div>

      <ContentSearch currentSearch={search} currentType={type} />

      {items.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
          <p>No content found.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Subject</th>
                <th className="text-left px-4 py-2 font-medium">Author</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Students</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="text-left px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.type}-${item.id}`} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{item.title}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        item.type === "course"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      }`}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {item.subject ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {item.authorName ?? item.authorEmail ?? "System"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {item.studentCount > 0 ? item.studentCount.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {item.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <ContentActions
                      contentId={item.id}
                      contentType={item.type}
                      currentStatus={item.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "published" | "draft" | "archived" | "flagged";
}) {
  const styles: Record<string, string> = {
    published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    archived: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    flagged: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${styles[status]}`}>
      {status}
    </span>
  );
}
