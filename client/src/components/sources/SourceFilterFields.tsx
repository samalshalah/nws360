import { useState } from "react";
import { ChevronDown, Filter, X } from "lucide-react";
import {
  SOURCE_FILTER_FIELDS,
  type SourceFilterConfig,
  type SourceFilterField,
  type SourceFilterRule,
} from "@shared/source-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const FIELD_LABELS: Record<SourceFilterField, string> = {
  title: "Title",
  description: "Description",
  link: "Link",
  imageTitle: "Image title",
};

function FilterRuleFields({
  kind,
  value,
  onChange,
}: {
  kind: "whitelist" | "blacklist";
  value: SourceFilterRule;
  onChange: (value: SourceFilterRule) => void;
}) {
  const [keywordDraft, setKeywordDraft] = useState("");
  const label = kind === "whitelist" ? "Whitelist" : "Blacklist";
  const description = kind === "whitelist" ? "Keep matching articles only" : "Reject matching articles";
  const toggleField = (field: SourceFilterField, checked: boolean) => {
    const fields = checked ? [...value.fields, field] : value.fields.filter((item) => item !== field);
    if (fields.length > 0) onChange({ ...value, fields: Array.from(new Set(fields)) });
  };
  const addKeywords = () => {
    const additions = keywordDraft.split(/[,\n]/).map((keyword) => keyword.trim()).filter(Boolean);
    if (additions.length > 0) {
      onChange({ ...value, keywords: Array.from(new Set([...value.keywords, ...additions])).slice(0, 100) });
    }
    setKeywordDraft("");
  };

  return (
    <div className="space-y-3 rounded-md border p-4" data-testid={`source-filter-${kind}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          aria-label={`Enable ${label.toLowerCase()}`}
          data-testid={`switch-${kind}`}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${kind}-keywords`}>Keywords</Label>
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
          {value.keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="gap-1 pr-1 font-normal">
              {keyword}
              <button
                type="button"
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => onChange({ ...value, keywords: value.keywords.filter((item) => item !== keyword) })}
                aria-label={`Remove ${keyword}`}
                disabled={!value.enabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            id={`${kind}-keywords`}
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onBlur={addKeywords}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addKeywords();
              }
            }}
            placeholder={value.keywords.length === 0 ? (kind === "whitelist" ? "oil, energy, OPEC" : "sports, opinion") : "Add keyword"}
            disabled={!value.enabled}
            className="h-6 min-w-28 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
            data-testid={`input-${kind}-keywords`}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Match in</Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {SOURCE_FILTER_FIELDS.map((field) => (
            <label key={field} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={value.fields.includes(field)}
                onCheckedChange={(checked) => toggleField(field, checked === true)}
                disabled={!value.enabled}
                data-testid={`${kind}-field-${field}`}
              />
              {FIELD_LABELS[field]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SourceFilterFields({
  value,
  onChange,
  defaultOpen = false,
}: {
  value: SourceFilterConfig;
  onChange: (value: SourceFilterConfig) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const enabledCount = Number(value.whitelist.enabled) + Number(value.blacklist.enabled);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-4" data-testid="source-feed-filters">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2">
          <Filter className="h-4 w-4" />
          Feed filters
          {enabledCount > 0 && <Badge variant="secondary" className="ml-1">{enabledCount} enabled</Badge>}
          <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid gap-3 md:grid-cols-2">
          <FilterRuleFields kind="whitelist" value={value.whitelist} onChange={(whitelist) => onChange({ ...value, whitelist })} />
          <FilterRuleFields kind="blacklist" value={value.blacklist} onChange={(blacklist) => onChange({ ...value, blacklist })} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
