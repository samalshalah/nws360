import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Brain, Calendar, TrendingUp, BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-foreground mb-6" data-testid="text-page-title">Reports</h1>

      <div className="space-y-4">
        <Card className="p-5" data-testid="card-weekly-summary">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Weekly Summary</h2>
              <p className="text-xs text-muted-foreground">Auto-generated overview of this week's coverage</p>
            </div>
            <Badge variant="secondary" className="ml-auto text-xs">Weekly</Badge>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground" data-testid="text-weekly-articles">--</p>
              <p className="text-xs text-muted-foreground">Articles</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground" data-testid="text-weekly-topics">--</p>
              <p className="text-xs text-muted-foreground">Topics</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground" data-testid="text-weekly-sources">--</p>
              <p className="text-xs text-muted-foreground">Sources</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Summary will be generated when enough data is available.</p>
        </Card>

        <Card className="p-5" data-testid="card-topic-export">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Topic Export</h2>
              <p className="text-xs text-muted-foreground">Download topic analysis as CSV</p>
            </div>
          </div>
          <Separator className="my-3" />
          <Button variant="outline" size="sm" data-testid="button-export-topics">
            <Download className="w-4 h-4 mr-1" /> Export Topics
          </Button>
        </Card>

        <Card className="p-5" data-testid="card-ai-brief">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
              <Brain className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">AI Intelligence Brief</h2>
              <p className="text-xs text-muted-foreground">Generate a comprehensive AI-powered brief</p>
            </div>
          </div>
          <Separator className="my-3" />
          <Button variant="outline" size="sm" disabled data-testid="button-generate-brief">
            <Brain className="w-4 h-4 mr-1" /> Generate Brief
          </Button>
          <p className="text-xs text-muted-foreground mt-2">AI briefing will be available after sufficient article analysis.</p>
        </Card>

        <Card className="p-5" data-testid="card-custom-report">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Custom Report</h2>
              <p className="text-xs text-muted-foreground">Build a report with custom date range and filters</p>
            </div>
          </div>
          <Separator className="my-3" />
          <Button variant="outline" size="sm" disabled data-testid="button-custom-report">
            <FileText className="w-4 h-4 mr-1" /> Create Report
          </Button>
        </Card>
      </div>
    </div>
  );
}
