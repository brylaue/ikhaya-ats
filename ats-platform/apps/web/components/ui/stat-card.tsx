import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon?: LucideIcon;
  trend?: "up" | "down";
}

export function StatCard({ label, value, delta, deltaLabel, icon: Icon, trend }: StatCardProps) {
  const getTrendColor = (trend: "up" | "down" | undefined) => {
    if (!trend) return "text-muted-foreground";
    return trend === "up" ? "text-green-600" : "text-red-600";
  };

  const getTrendSymbol = (trend: "up" | "down" | undefined) => {
    if (!trend) return "→";
    return trend === "up" ? "↑" : "↓";
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-foreground">{value}</p>
            {delta !== undefined && (
              <p className={`text-sm font-semibold ${getTrendColor(trend)}`}>
                <span>{getTrendSymbol(trend)}</span>
                {Math.abs(delta)}%
              </p>
            )}
          </div>
          {deltaLabel && (
            <p className="text-xs text-muted-foreground mt-1">{deltaLabel}</p>
          )}
        </div>
        {Icon && (
          <div className="flex-shrink-0">
            <Icon className="text-muted-foreground/60" size={32} />
          </div>
        )}
      </div>
    </div>
  );
}
