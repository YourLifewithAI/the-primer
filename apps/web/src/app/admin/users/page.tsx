import { getUsers } from "@/lib/admin-analytics";
import { RoleBadge } from "@/components/admin/role-badge";
import { UserSearch } from "@/components/admin/user-search";
import Link from "next/link";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? "";
  const roleParam = params.role;
  const role =
    roleParam && Object.values(UserRole).includes(roleParam as UserRole)
      ? (roleParam as UserRole)
      : undefined;
  const page = parseInt(params.page ?? "1", 10);
  const pageSize = 25;

  const { users, total } = await getUsers({ search, role, page, pageSize });
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">User Management</h2>
        <span className="text-sm text-muted-foreground">
          {total} user{total !== 1 ? "s" : ""} total
        </span>
      </div>

      <UserSearch currentSearch={search} currentRole={role} />

      {users.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
          <p>No users found.</p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">Role</th>
                  <th className="text-right px-4 py-2 font-medium">Responses</th>
                  <th className="text-right px-4 py-2 font-medium">Tutor Sessions</th>
                  <th className="text-left px-4 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="text-primary hover:underline"
                      >
                        {user.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-2">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {user._count.responses.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {user._count.tutorSessions}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {user.createdAt.toLocaleDateString()}
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
                  href={`/admin/users?${buildQuery({ search, role, page: page - 1 })}`}
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
                  href={`/admin/users?${buildQuery({ search, role, page: page + 1 })}`}
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

function buildQuery(params: { search?: string; role?: UserRole; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.role) sp.set("role", params.role);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  return sp.toString();
}
