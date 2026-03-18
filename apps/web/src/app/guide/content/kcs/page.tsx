import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { db } from "@/lib/db";
import { KCManager } from "@/components/guide/content/kc-manager";

export const dynamic = "force-dynamic";

export default async function KCManagementPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  try {
    await ensureGuide(clerkId);
  } catch {
    redirect("/dashboard");
  }

  const kcs = await db.knowledgeComponent.findMany({
    include: {
      prerequisites: {
        include: { prerequisite: { select: { id: true, name: true } } },
      },
      _count: { select: { problemKCs: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-5xl mx-auto">
      <KCManager initialKCs={kcs} />
    </main>
  );
}
