import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureGuide } from "@/lib/ensure-guide";
import { ContentImporter } from "@/components/guide/content/content-importer";

export const dynamic = "force-dynamic";

export default async function ImportContentPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  try {
    await ensureGuide(clerkId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Import Content</h1>
      <p className="text-muted-foreground mb-6">
        Upload a course JSON file in Primer/OATutor format. The content will be
        validated before import.
      </p>
      <ContentImporter />
    </main>
  );
}
