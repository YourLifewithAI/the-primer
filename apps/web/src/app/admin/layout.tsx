import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureAdmin } from "@/lib/ensure-admin";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: "Admin",
  description: "Platform administration and analytics.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  try {
    await ensureAdmin(clerkId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 max-w-7xl mx-auto" role="main" aria-labelledby="admin-title">
      <div className="mb-4">
        <h1 id="admin-title" className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Platform administration and analytics
        </p>
      </div>
      <AdminNav />
      {children}
    </main>
  );
}
