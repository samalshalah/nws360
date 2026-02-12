import { Download, Image, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportChartAsPNG, exportToCSV } from "@/lib/export-utils";

interface ExportButtonProps {
  chartContainerId?: string;
  csvData?: Record<string, any>[];
  filename: string;
  className?: string;
}

export function ExportButton({ chartContainerId, csvData, filename, className }: ExportButtonProps) {
  const hasChart = !!chartContainerId;
  const hasCSV = csvData && csvData.length > 0;

  if (!hasChart && !hasCSV) return null;

  if (hasChart && !hasCSV) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => {
          const el = document.getElementById(chartContainerId!);
          exportChartAsPNG(el, filename);
        }}
        title="Export as PNG"
        data-testid={`button-export-${filename}`}
      >
        <Download className="w-4 h-4" />
      </Button>
    );
  }

  if (!hasChart && hasCSV) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => exportToCSV(csvData!, filename)}
        title="Export as CSV"
        data-testid={`button-export-${filename}`}
      >
        <Download className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} data-testid={`button-export-${filename}`}>
          <Download className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasChart && (
          <DropdownMenuItem
            onClick={() => {
              const el = document.getElementById(chartContainerId!);
              exportChartAsPNG(el, filename);
            }}
            data-testid={`button-export-png-${filename}`}
          >
            <Image className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
            Export as PNG
          </DropdownMenuItem>
        )}
        {hasCSV && (
          <DropdownMenuItem
            onClick={() => exportToCSV(csvData!, filename)}
            data-testid={`button-export-csv-${filename}`}
          >
            <FileSpreadsheet className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
            Export as CSV
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
