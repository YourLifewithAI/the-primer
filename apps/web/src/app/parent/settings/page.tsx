import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureParent } from "@/lib/ensure-parent";
import { db } from "@/lib/db";
import { NotificationSettingsForm } from "@/components/parent/notification-settings-form";

export const metadata: Metadata = {
  title: "Notification Settings",
  description: "Configure how and when you receive notifications about your child's progress.",
};

export const dynamic = "force-dynamic";

export default async function ParentSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  let parentProfile;
  try {
    const result = await ensureParent(clerkId);
    parentProfile = result.parentProfile;
  } catch {
    redirect("/dashboard");
  }

  // Get or create notification preferences
  let prefs = await db.parentNotificationPreference.findUnique({
    where: { parentProfileId: parentProfile.id },
  });

  if (!prefs) {
    prefs = await db.parentNotificationPreference.create({
      data: { parentProfileId: parentProfile.id },
    });
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto" role="main" aria-labelledby="settings-title">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-1 text-sm">
        <Link
          href="/parent"
          className="text-muted-foreground hover:text-foreground"
        >
          Parent Dashboard
        </Link>
        <span className="text-muted-foreground">/</span>
      </div>

      <h1 id="settings-title" className="text-2xl font-bold mb-2">Notification Settings</h1>
      <p className="text-muted-foreground mb-8">
        Choose how and when you&apos;d like to be notified about your child&apos;s progress.
      </p>

      <NotificationSettingsForm
        initialSettings={{
          emailFrequency: prefs.emailFrequency,
          milestoneAlerts: prefs.milestoneAlerts,
          struggleAlerts: prefs.struggleAlerts,
          weeklyReport: prefs.weeklyReport,
        }}
      />
    </main>
  );
}
