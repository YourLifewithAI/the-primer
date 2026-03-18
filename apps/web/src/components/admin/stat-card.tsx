export function StatCard({
  label,
  value,
  detail,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 flex items-center gap-2">
        {value}
        {trend === "up" && <span className="text-green-500 text-sm">+</span>}
        {trend === "down" && <span className="text-red-500 text-sm">-</span>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{detail}</div>
    </div>
  );
}
