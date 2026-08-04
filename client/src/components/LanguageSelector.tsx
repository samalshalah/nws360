import { Globe } from "lucide-react";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "inline-flex items-center gap-1.5 text-sm text-muted-foreground" : "inline-flex h-10 w-[140px] items-center gap-2 rounded-md border border-input bg-background px-3 text-sm"}
      data-testid="language-english-only"
      aria-label="Language: English"
    >
      <Globe className="w-4 h-4 shrink-0" />
      {!compact && <span>English</span>}
    </div>
  );
}
