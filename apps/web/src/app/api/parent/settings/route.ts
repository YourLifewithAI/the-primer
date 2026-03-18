import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureParent } from "@/lib/ensure-parent";
import { db } from "@/lib/db";

/**
 * GET /api/parent/settings
 * Get notification preferences.
 *
 * POST /api/parent/settings
 * Update notification preferences.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { parentProfile } = await ensureParent(clerkId);

    let prefs = await db.parentNotificationPreference.findUnique({
      where: { parentProfileId: parentProfile.id },
    });

    if (!prefs) {
      prefs = await db.parentNotificationPreference.create({
        data: { parentProfileId: parentProfile.id },
      });
    }

    return NextResponse.json({
      emailFrequency: prefs.emailFrequency,
      milestoneAlerts: prefs.milestoneAlerts,
      struggleAlerts: prefs.struggleAlerts,
      weeklyReport: prefs.weeklyReport,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { parentProfile } = await ensureParent(clerkId);
    const body = await req.json();

    const {
      emailFrequency,
      milestoneAlerts,
      struggleAlerts,
      weeklyReport,
    } = body as {
      emailFrequency?: string;
      milestoneAlerts?: boolean;
      struggleAlerts?: boolean;
      weeklyReport?: boolean;
    };

    // Validate emailFrequency
    const validFrequencies = ["DAILY", "WEEKLY", "NEVER"];
    if (emailFrequency && !validFrequencies.includes(emailFrequency)) {
      return NextResponse.json(
        { error: "Invalid email frequency. Must be DAILY, WEEKLY, or NEVER." },
        { status: 400 }
      );
    }

    const prefs = await db.parentNotificationPreference.upsert({
      where: { parentProfileId: parentProfile.id },
      update: {
        ...(emailFrequency !== undefined && {
          emailFrequency: emailFrequency as "DAILY" | "WEEKLY" | "NEVER",
        }),
        ...(milestoneAlerts !== undefined && { milestoneAlerts }),
        ...(struggleAlerts !== undefined && { struggleAlerts }),
        ...(weeklyReport !== undefined && { weeklyReport }),
      },
      create: {
        parentProfileId: parentProfile.id,
        ...(emailFrequency !== undefined && {
          emailFrequency: emailFrequency as "DAILY" | "WEEKLY" | "NEVER",
        }),
        ...(milestoneAlerts !== undefined && { milestoneAlerts }),
        ...(struggleAlerts !== undefined && { struggleAlerts }),
        ...(weeklyReport !== undefined && { weeklyReport }),
      },
    });

    return NextResponse.json({
      emailFrequency: prefs.emailFrequency,
      milestoneAlerts: prefs.milestoneAlerts,
      struggleAlerts: prefs.struggleAlerts,
      weeklyReport: prefs.weeklyReport,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}
