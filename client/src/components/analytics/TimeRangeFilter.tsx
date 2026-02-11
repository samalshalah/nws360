import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type TimePreset = "1h" | "6h" | "today" | "7d" | "30d" | "custom";

export interface TimeRange {
  startDate: string;
  endDate: string;
  preset: TimePreset;
}

function getPresetRange(preset: TimePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString();
  let startDate: string;

  switch (preset) {
    case "1h":
      startDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      break;
    case "6h":
      startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      break;
    case "today": {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      startDate = todayStart.toISOString();
      break;
    }
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      break;
  }

  return { startDate, endDate };
}

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function useTimeRange(defaultPreset: TimePreset = "7d"): [TimeRange, (range: TimeRange) => void] {
  const initial = getPresetRange(defaultPreset);
  const [range, setRange] = useState<TimeRange>({ ...initial, preset: defaultPreset });
  return [range, setRange];
}

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  const { t } = useTranslation();
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const presets: { key: TimePreset; label: string }[] = [
    { key: "1h", label: t("timeRange.lastHour") },
    { key: "6h", label: t("timeRange.last6Hours") },
    { key: "today", label: t("timeRange.today") },
    { key: "7d", label: t("timeRange.last7Days") },
    { key: "30d", label: t("timeRange.last30Days") },
  ];

  const handlePreset = (preset: TimePreset) => {
    const range = getPresetRange(preset);
    onChange({ ...range, preset });
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      const start = new Date(customFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
      onChange({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        preset: "custom",
      });
      setPopoverOpen(false);
    }
  };

  const formatDateRange = () => {
    if (value.preset !== "custom") return null;
    const from = new Date(value.startDate).toLocaleDateString();
    const to = new Date(value.endDate).toLocaleDateString();
    return `${from} - ${to}`;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="time-range-filter">
      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
      {presets.map((p) => (
        <Button
          key={p.key}
          variant={value.preset === p.key ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p.key)}
          data-testid={`time-preset-${p.key}`}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.preset === "custom" ? "default" : "outline"}
            size="sm"
            data-testid="time-preset-custom"
          >
            <CalendarIcon className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
            {value.preset === "custom" ? formatDateRange() : t("timeRange.custom")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="end">
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("timeRange.selectRange")}</p>
            <div className="flex gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("timeRange.from")}</p>
                <Calendar
                  mode="single"
                  selected={customFrom}
                  onSelect={setCustomFrom}
                  disabled={(date) => date > new Date()}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("timeRange.to")}</p>
                <Calendar
                  mode="single"
                  selected={customTo}
                  onSelect={setCustomTo}
                  disabled={(date) => date > new Date() || (customFrom ? date < customFrom : false)}
                />
              </div>
            </div>
            <Button
              onClick={handleCustomApply}
              disabled={!customFrom || !customTo}
              className="w-full"
              size="sm"
              data-testid="button-apply-custom-range"
            >
              {t("timeRange.apply")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
