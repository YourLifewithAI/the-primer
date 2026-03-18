import { getUserDetail } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { RoleBadge } from "@/components/admin/role-badge";
import { RoleChanger } from "@/components/admin/role-changer";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await getUserDetail(userId);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Users
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{user.name ?? "Unnamed User"}</h2>
          <p className="text-muted-foreground">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <RoleBadge role={user.role} />
            <span className="text-xs text-muted-foreground">
              Joined {user.createdAt.toLocaleDateString()}
            </span>
          </div>
        </div>
        <RoleChanger userId={user.id} currentRole={user.role} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Problem Responses"
          value={user.responseCount.toLocaleString()}
          detail="total attempts"
        />
        <StatCard
          label="Tutor Sessions"
          value={`${user.tutorSessionCount}`}
          detail="AI tutor conversations"
        />
        <StatCard
          label="Enrollments"
          value={`${user.enrollmentCount}`}
          detail="courses enrolled"
        />
        <StatCard
          label="Mastery"
          value={`${user.masteredCount}/${user.masteryCount}`}
          detail="KCs mastered"
        />
      </div>

      <div className="border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">Activity Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Active</span>
            <span>
              {user.lastActiveAt
                ? user.lastActiveAt.toLocaleString()
                : "Never"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account Updated</span>
            <span>{user.updatedAt.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Clerk ID</span>
            <span className="font-mono text-xs">{user.clerkId}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
