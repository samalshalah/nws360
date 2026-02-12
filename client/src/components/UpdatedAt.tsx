import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface UpdatedAtProps {
  timestamp?: Date | string | number | null;
  className?: string;
  prefix?: string;
}

export function UpdatedAt({ timestamp, className, prefix = "Updated" }: UpdatedAtProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!timestamp) return null;

  const date = typeof timestamp === "number" ? new Date(timestamp) : typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const relativeTime = formatDistanceToNow(date, { addSuffix: true });

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
      data-testid="text-updated-at"
      title={date.toLocaleString()}
    >
      <Clock className="w-3 h-3" />
      {prefix} {relativeTime}
    </span>
  );
}
