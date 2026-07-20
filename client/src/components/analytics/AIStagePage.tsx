import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AIStagePageProps {
  title: string;
  description: string;
  capabilities: string[];
}

export function AIStagePage({ title, description, capabilities }: AIStagePageProps) {
  return (
    <div className="mx-auto max-w-3xl py-8 sm:py-14" data-testid="ai-stage-page">
      <div className="border-y border-border py-8 sm:py-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <Badge variant="secondary">AI stage</Badge>
        </div>
        <h1 className="mt-5 text-2xl font-bold">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {capabilities.map((capability) => (
            <div key={capability} className="border-l-2 border-primary/40 py-1 pl-3 text-sm text-foreground/80">
              {capability}
            </div>
          ))}
        </div>
        <Button asChild variant="outline" className="mt-8">
          <Link href="/analytics">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to analytics
          </Link>
        </Button>
      </div>
    </div>
  );
}
