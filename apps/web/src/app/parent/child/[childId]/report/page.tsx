import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureParent, verifyChildAccess } from "@/lib/ensure-parent";
import { getWeeklyReport } from "@/lib/parent-analytics";
import { db } from "@/lib/db";
import { PrintButton } from "@/components/parent/print-button";

export const dynamic = "force-dynamic";

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  let parentProfile;
  let user;
  try {
    const result = await ensureParent(clerkId);
    parentProfile = result.parentProfile;
    user = result.user;
  } catch {
    redirect("/dashboard");
  }

  const { childId } = await params;

  try {
    await verifyChildAccess(parentProfile, childId);
  } catch {
    redirect("/parent");
  }

  const report = await getWeeklyReport(childId);

  // FERPA audit log
  await db.dataAccessLog.create({
    data: {
      userId: user.id,
      studentId: childId,
      action: "view_report",
      details: { context: "parent_weekly_report_page" },
    },
  });

  return (
    <>
      {/* Print-friendly styles */}
      <style>{`
        @media print {
          header, nav, .no-print { display: none !important; }
          main { max-width: 100% !important; padding: 0 !important; }
          body { background: white !important; color: black !important; }
          .print-break { page-break-before: always; }
          .border { border-color: #e5e7eb !important; }
          .bg-green-500, .bg-blue-500, .bg-amber-500 { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <main className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
        {/* Breadcrumb (hidden in print) */}
        <div className="flex items-center gap-2 mb-1 text-sm no-print">
          <Link
            href="/parent"
            className="text-muted-foreground hover:text-foreground"
          >
            Parent Dashboard
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link
            href={`/parent/child/${childId}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {report.childName ?? "Student"}
          </Link>
          <span className="text-muted-foreground">/</span>
        </div>

        {/* Print button */}
        <div className="flex items-center justify-between mb-6 no-print">
          <h1 className="text-2xl font-bold">Weekly Progress Report</h1>
          <PrintButton />
        </div>

        {/* Report header */}
        <div className="border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">
                {report.childName ?? "Student"}
              </h2>
              {report.gradeLevel && (
                <p className="text-sm text-muted-foreground">
                  Grade {report.gradeLevel}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div>The Primer</div>
              <div>
                Week of {new Date(report.weekStarting).toLocaleDateString()} &ndash;{" "}
                {new Date(report.weekEnding).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ReportStat label="Problems Solved" value={`${report.problemsSolved}`} />
            <ReportStat
              label="Accuracy"
              value={`${Math.round(report.accuracy * 100)}%`}
            />
            <ReportStat
              label="Time Invested"
              value={`${Math.round(report.timeInvested)}m`}
            />
            <ReportStat label="Streak" value={`${report.streak} days`} />
          </div>
        </div>

        {/* Encouragement */}
        <div className="border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 rounded-lg p-4 mb-6">
          <p className="text-sm text-green-700 dark:text-green-300">
            {report.encouragement}
          </p>
        </div>

        {/* Newly mastered skills */}
        {report.newlyMastered.length > 0 && (
          <section className="mb-6">
            <h3 className="font-semibold mb-3">
              New Skills Mastered This Week
            </h3>
            <div className="flex flex-wrap gap-2">
              {report.newlyMastered.map((skill) => (
                <span
                  key={skill}
                  className="text-sm px-3 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Mastery gains */}
        {report.masteryGains.length > 0 && (
          <section className="mb-6">
            <h3 className="font-semibold mb-3">Skills Practiced</h3>
            <div className="border border-border rounded-lg divide-y divide-border">
              {report.masteryGains.map((gain) => (
                <div
                  key={gain.kcName}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span>{gain.kcName}</span>
                  <span className="text-muted-foreground">
                    {Math.round(gain.currentMastery * 100)}% mastery
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Strengths & areas for practice */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {report.strengths.length > 0 && (
            <section className="border border-border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Strengths</h3>
              <ul className="space-y-1">
                {report.strengths.map((s) => (
                  <li key={s} className="text-sm flex items-center gap-2">
                    <span className="text-green-500">{"\u2713"}</span>
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.areasForPractice.length > 0 && (
            <section className="border border-border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Areas for Practice</h3>
              <ul className="space-y-1">
                {report.areasForPractice.map((a) => (
                  <li key={a} className="text-sm flex items-center gap-2">
                    <span className="text-amber-500">{"\u25CB"}</span>
                    {a}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-3">
                These are opportunities for growth. Encourage regular short
                practice sessions for the best results.
              </p>
            </section>
          )}
        </div>

        {/* Report footer */}
        <div className="text-center text-xs text-muted-foreground mt-8 mb-4">
          <p>
            Generated by The Primer &middot;{" "}
            {new Date().toLocaleDateString()}
          </p>
          <p className="mt-1">
            This report reflects your child&apos;s individual progress only.
          </p>
        </div>
      </main>
    </>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-3 border border-border rounded-lg">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
