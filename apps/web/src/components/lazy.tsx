/**
 * Lazy-loaded heavy components using next/dynamic.
 * These components are not needed on initial render and benefit from code splitting.
 */
import dynamic from "next/dynamic";
import { SkeletonBox } from "@/components/skeleton";

function ChartFallback() {
  return <SkeletonBox className="h-40 w-full" />;
}

function ChatFallback() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm text-muted-foreground bg-border/20 rounded-lg">
      Loading tutor...
    </div>
  );
}

export const LazyTutorChat = dynamic(
  () => import("@/components/tutor-chat").then((m) => m.TutorChat),
  {
    loading: ChatFallback,
    ssr: false,
  },
);

export const LazyKcHeatmap = dynamic(
  () => import("@/components/guide/kc-heatmap").then((m) => m.KCHeatmap),
  {
    loading: ChartFallback,
    ssr: false,
  },
);

export const LazyBarChart = dynamic(
  () => import("@/components/admin/bar-chart").then((m) => m.BarChart),
  {
    loading: ChartFallback,
    ssr: false,
  },
);

export const LazySparkLine = dynamic(
  () => import("@/components/admin/bar-chart").then((m) => m.SparkLine),
  {
    loading: ChartFallback,
    ssr: false,
  },
);

export const LazyTimeChart = dynamic(
  () => import("@/components/parent/time-chart").then((m) => m.TimeChart),
  {
    loading: ChartFallback,
    ssr: false,
  },
);
