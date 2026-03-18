import { getPlatformStats } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { RoleBadge } from "@/components/admin/role-badge";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const stats = await getPlatformStats();

  return (
    <div>
      {/* User counts */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Total Users"
            value={`${stats.users.total}`}
            detail="all roles"
          />
          <StatCard
            label="Students"
            value={`${stats.users.students}`}
            detail={`${Math.round((stats.users.students / Math.max(stats.users.total, 1)) * 100)}% of total`}
          />
          <StatCard
            label="Guides"
            value={`${stats.users.guides}`}
            detail={`${Math.round((stats.users.guides / Math.max(stats.users.total, 1)) * 100)}% of total`}
          />
          <StatCard
            label="Parents"
            value={`${stats.users.parents}`}
            detail={`${Math.round((stats.users.parents / Math.max(stats.users.total, 1)) * 100)}% of total`}
          />
          <StatCard
            label="Admins"
            value={`${stats.users.admins}`}
            detail="platform admins"
          />
        </div>
      </section>

      {/* Active users */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Active Users</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Daily Active"
            value={`${stats.activeUsers.daily}`}
            detail="last 24 hours"
          />
          <StatCard
            label="Weekly Active"
            value={`${stats.activeUsers.weekly}`}
            detail="last 7 days"
          />
          <StatCard
            label="Monthly Active"
            value={`${stats.activeUsers.monthly}`}
            detail="last 30 days"
          />
        </div>
      </section>

      {/* Content stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Content</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Courses"
            value={`${stats.content.courses}`}
            detail="total courses"
          />
          <StatCard
            label="Lessons"
            value={`${stats.content.lessons}`}
            detail="total lessons"
          />
          <StatCard
            label="Problems"
            value={`${stats.content.problems}`}
            detail="total problems"
          />
          <StatCard
            label="Knowledge Components"
            value={`${stats.content.knowledgeComponents}`}
            detail="total KCs"
          />
        </div>
      </section>

      {/* Learning stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Learning</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total Responses"
            value={stats.learning.totalResponses.toLocaleString()}
            detail="problem attempts"
          />
          <StatCard
            label="Mastery Transitions"
            value={stats.learning.totalMasteryTransitions.toLocaleString()}
            detail="KCs mastered"
          />
          <StatCard
            label="Average Accuracy"
            value={`${Math.round(stats.learning.averageAccuracy * 100)}%`}
            detail="across all responses"
          />
        </div>
      </section>

      {/* AI Tutor stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">AI Tutor</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Tutor Sessions"
            value={stats.tutor.totalSessions.toLocaleString()}
            detail="total sessions"
          />
          <StatCard
            label="Input Tokens"
            value={formatTokens(stats.tutor.totalInputTokens)}
            detail="total consumed"
          />
          <StatCard
            label="Output Tokens"
            value={formatTokens(stats.tutor.totalOutputTokens)}
            detail="total generated"
          />
          <StatCard
            label="Estimated Cost"
            value={`$${stats.tutor.estimatedCost.toFixed(2)}`}
            detail="Haiku pricing"
          />
        </div>
      </section>

      {/* Recent signups */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Recent Signups</h2>
        {stats.recentSignups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signups yet.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">Role</th>
                  <th className="text-left px-4 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSignups.map((user) => (
                  <tr key={user.id} className="border-t border-border">
                    <td className="px-4 py-2">{user.name ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-4 py-2">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {user.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}
