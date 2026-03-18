import type { Metadata } from "next";
import { getPlatformAnalytics } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { LazyBarChart as BarChart, LazySparkLine as SparkLine } from "@/components/lazy";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Platform engagement and usage analytics.",
};

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const analytics = await getPlatformAnalytics();

  // Prepare engagement sparkline data
  const engagementValues = analytics.engagementTrend.map((d) => d.activeUsers);
  const responseValues = analytics.engagementTrend.map((d) => d.totalResponses);

  // Tutor cost data for bar chart
  const tutorCostData = analytics.tutorUsage.slice(-14).map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: Math.round(d.estimatedCost * 100) / 100,
  }));

  const totalTutorCost = analytics.tutorUsage.reduce((sum, d) => sum + d.estimatedCost, 0);
  const totalTutorSessions = analytics.tutorUsage.reduce((sum, d) => sum + d.sessions, 0);
  const totalTutorMessages = analytics.tutorUsage.reduce((sum, d) => sum + d.totalMessages, 0);
  const avgMessagesPerSession = totalTutorSessions > 0 ? totalTutorMessages / totalTutorSessions : 0;

  return (
    <div>
      {/* Engagement Overview */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Engagement (Last 30 Days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard
            label="Peak DAU"
            value={`${Math.max(...engagementValues, 0)}`}
            detail="highest daily active"
          />
          <StatCard
            label="Avg DAU"
            value={`${engagementValues.length > 0 ? Math.round(engagementValues.reduce((a, b) => a + b, 0) / engagementValues.length) : 0}`}
            detail="average daily active"
          />
          <StatCard
            label="Total Responses"
            value={responseValues.reduce((a, b) => a + b, 0).toLocaleString()}
            detail="last 30 days"
          />
          <StatCard
            label="Avg Active Min"
            value={`${analytics.engagementTrend.length > 0 ? Math.round(analytics.engagementTrend.reduce((s, d) => s + d.avgActiveMinutes, 0) / analytics.engagementTrend.length) : 0}`}
            detail="per student per day"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-2">Daily Active Users</h3>
            <SparkLine data={engagementValues} height={60} color="bg-blue-500" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{analytics.engagementTrend[0]?.date ?? ""}</span>
              <span>{analytics.engagementTrend[analytics.engagementTrend.length - 1]?.date ?? ""}</span>
            </div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-2">Daily Responses</h3>
            <SparkLine data={responseValues} height={60} color="bg-green-500" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{analytics.engagementTrend[0]?.date ?? ""}</span>
              <span>{analytics.engagementTrend[analytics.engagementTrend.length - 1]?.date ?? ""}</span>
            </div>
          </div>
        </div>
      </section>

      {/* AI Tutor Analytics */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">AI Tutor Usage (Last 30 Days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard
            label="Total Sessions"
            value={totalTutorSessions.toLocaleString()}
            detail="last 30 days"
          />
          <StatCard
            label="Total Messages"
            value={totalTutorMessages.toLocaleString()}
            detail="across all sessions"
          />
          <StatCard
            label="Avg Messages/Session"
            value={avgMessagesPerSession.toFixed(1)}
            detail="per session"
          />
          <StatCard
            label="Estimated Cost"
            value={`$${totalTutorCost.toFixed(2)}`}
            detail="Haiku pricing (30d)"
          />
        </div>

        {tutorCostData.length > 0 && (
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">Daily Tutor Cost (Last 14 Days)</h3>
            <BarChart
              data={tutorCostData}
              direction="vertical"
              height={160}
              barColor="bg-purple-500"
            />
          </div>
        )}
      </section>

      {/* Mastery by Grade/Subject */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Mastery by Grade &amp; Subject</h2>
        {analytics.masteryByGradeSubject.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mastery data yet.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Grade</th>
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-left px-4 py-2 font-medium">Avg Mastery</th>
                  <th className="text-right px-4 py-2 font-medium">Students</th>
                  <th className="text-right px-4 py-2 font-medium">Mastered KCs</th>
                  <th className="text-right px-4 py-2 font-medium">Total KCs</th>
                </tr>
              </thead>
              <tbody>
                {analytics.masteryByGradeSubject
                  .sort((a, b) => a.gradeLevel - b.gradeLevel || a.subject.localeCompare(b.subject))
                  .map((entry, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2">
                        {entry.gradeLevel === 0 ? "N/A" : `Grade ${entry.gradeLevel}`}
                      </td>
                      <td className="px-4 py-2">{entry.subject}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden max-w-[100px]">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.round(entry.averageMastery * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(entry.averageMastery * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {entry.studentCount}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {entry.masteredCount}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {entry.totalKCs}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top & Least Used Courses */}
      <section className="grid md:grid-cols-2 gap-4 mb-8">
        <div>
          <h2 className="text-lg font-semibold mb-4">Most Enrolled Courses</h2>
          {analytics.topCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollment data.</p>
          ) : (
            <BarChart
              data={analytics.topCourses.map((c) => ({
                label: c.title.length > 20 ? c.title.slice(0, 18) + "..." : c.title,
                value: c.enrollmentCount,
              }))}
              direction="horizontal"
              barColor="bg-blue-500"
            />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-4">Unused Courses</h2>
          {analytics.leastUsedCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">All courses have enrollments.</p>
          ) : (
            <div className="space-y-2">
              {analytics.leastUsedCourses.map((c) => (
                <div
                  key={c.id}
                  className="text-sm border border-border rounded-lg px-3 py-2 flex justify-between"
                >
                  <span>{c.title}</span>
                  <span className="text-xs text-muted-foreground">{c.subject}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
