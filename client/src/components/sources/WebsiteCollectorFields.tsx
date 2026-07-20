import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import type { WebsiteCollectorConfig } from "@shared/source-collector";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const DEFAULT_WEBSITE_COLLECTOR_CONFIG: WebsiteCollectorConfig = {
  strategy: "auto",
  renderJavascript: false,
  selectors: {},
};

const SELECTOR_FIELDS: Array<{ key: keyof NonNullable<WebsiteCollectorConfig["selectors"]>; label: string; placeholder: string }> = [
  { key: "item", label: "Article item", placeholder: "article.news-card" },
  { key: "link", label: "Article link", placeholder: "a.headline" },
  { key: "title", label: "Title", placeholder: "h2" },
  { key: "summary", label: "Summary", placeholder: ".summary" },
  { key: "image", label: "Image", placeholder: "img" },
  { key: "date", label: "Published date", placeholder: "time" },
];

export function WebsiteCollectorFields({
  value,
  onChange,
  detectedFeedUrl,
}: {
  value: WebsiteCollectorConfig;
  onChange: (value: WebsiteCollectorConfig) => void;
  detectedFeedUrl?: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selectors = value.selectors || {};
  const updateSelectors = (key: keyof typeof selectors, nextValue: string) => {
    const nextSelectors = { ...selectors, [key]: nextValue || undefined };
    onChange({ ...value, selectors: nextSelectors });
  };

  return (
    <div className="space-y-4" data-testid="website-collector-settings">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Collection method</Label>
          <Select
            value={value.strategy}
            onValueChange={(strategy: WebsiteCollectorConfig["strategy"]) => onChange({ ...value, strategy })}
          >
            <SelectTrigger data-testid="select-website-collector-strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="rss">RSS / Atom only</SelectItem>
              <SelectItem value="scrape">Website collector only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(detectedFeedUrl || value.feedUrl) && value.strategy !== "scrape" && (
          <div className="space-y-2">
            <Label htmlFor="collector-feed-url">Detected feed</Label>
            <Input id="collector-feed-url" value={detectedFeedUrl || value.feedUrl || ""} readOnly />
          </div>
        )}
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="h-9 gap-2 px-2" data-testid="button-collector-selectors">
            <Settings2 className="h-4 w-4" />
            Extraction selectors
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
            {SELECTOR_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`collector-selector-${field.key}`}>{field.label}</Label>
                <Input
                  id={`collector-selector-${field.key}`}
                  value={selectors[field.key] || ""}
                  onChange={(event) => updateSelectors(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  data-testid={`input-collector-${field.key}`}
                />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
