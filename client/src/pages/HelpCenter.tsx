import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HelpCircle,
  BookOpen,
  BarChart3,
  Brain,
  Rss,
  ChevronDown,
  ChevronUp,
  Send,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const quickHelpItems = [
  {
    title: "Getting Started",
    icon: BookOpen,
    description:
      "Set up your account, add your first news sources, and configure keyword tracking to begin monitoring topics that matter to you.",
  },
  {
    title: "Understanding Analytics",
    icon: BarChart3,
    description:
      "Learn how to interpret sentiment scores, trend graphs, and content volume metrics to gain actionable insights from your news data.",
  },
  {
    title: "AI Intelligence",
    icon: Brain,
    description:
      "Discover how NWS360 uses AI to generate daily briefings, detect narrative shifts, and surface emerging stories automatically.",
  },
  {
    title: "Managing Sources",
    icon: Rss,
    description:
      "Add, remove, and prioritize news sources. Configure source health monitoring and set up alerts for source failures.",
  },
];

const glossaryItems = [
  {
    term: "Sentiment Score",
    definition:
      "A numerical value from -1 to 1 indicating the emotional tone of an article or group of articles. Positive values indicate favorable coverage, negative values indicate critical coverage, and values near zero indicate neutral reporting.",
  },
  {
    term: "Story Cluster",
    definition:
      "A group of related articles covering the same news event or topic, automatically grouped by AI analysis. Clusters help you see how many sources are covering a story and from what angles.",
  },
  {
    term: "Intelligence Brief",
    definition:
      "An AI-generated daily summary of the most important news developments, emerging trends, and notable shifts in coverage across your monitored sources and keywords.",
  },
  {
    term: "Entity Tracking",
    definition:
      "Automatic identification and monitoring of people, organizations, and locations mentioned across your news sources. Tracks mention frequency and sentiment over time.",
  },
  {
    term: "Narrative Analysis",
    definition:
      "AI-powered comparison of how different sources frame and present the same story, revealing editorial bias, emphasis differences, and unique angles.",
  },
  {
    term: "Source Priority",
    definition:
      "A ranking you assign to news sources to indicate their importance. Higher priority sources are weighted more heavily in briefings and alerts.",
  },
  {
    term: "Keyword Tracking",
    definition:
      "Monitoring specific words or phrases across all configured news sources. Tracked keywords trigger article collection and can generate alerts when volume spikes.",
  },
  {
    term: "Content Volume",
    definition:
      "The total number of articles collected and processed over a given time period. Spikes in content volume can indicate breaking news or trending topics.",
  },
  {
    term: "Trend Prediction",
    definition:
      "AI-based forecasting of topic trajectories, predicting whether a story or keyword will gain or lose coverage momentum in the coming days.",
  },
  {
    term: "API Key",
    definition:
      "A unique authentication token that allows external applications to access NWS360 data programmatically through the REST API.",
  },
];

export default function HelpCenter() {
  const { toast } = useToast();
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");

  const toggleTerm = (term: string) => {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) {
        next.delete(term);
      } else {
        next.add(term);
      }
      return next;
    });
  };

  const submitTicket = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/support/tickets", {
        subject,
        message,
        priority,
      });
    },
    onSuccess: () => {
      toast({
        title: "Support request submitted",
        description: "We'll get back to you as soon as possible.",
      });
      setSubject("");
      setMessage("");
      setPriority("normal");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    submitTicket.mutate();
  };

  return (
    <div className="space-y-8 animate-fade-in" data-testid="help-center-page">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <HelpCircle className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-help-title">
            Help Center
          </h1>
        </div>
        <p className="text-muted-foreground" data-testid="text-help-subtitle">
          Find answers and get support
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-quick-help-heading">
            Quick Help
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickHelpItems.map((item, index) => (
            <Card key={item.title} data-testid={`card-quick-help-${index}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <item.icon className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-glossary-heading">
            Glossary
          </h2>
        </div>
        <Card data-testid="card-glossary">
          <CardContent className="p-0 divide-y divide-border">
            {glossaryItems.map((item) => {
              const isExpanded = expandedTerms.has(item.term);
              return (
                <div key={item.term}>
                  <button
                    type="button"
                    className="flex items-center justify-between gap-4 w-full px-4 py-3 text-left hover-elevate"
                    onClick={() => toggleTerm(item.term)}
                    data-testid={`button-glossary-${item.term.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {item.term}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3" data-testid={`text-glossary-definition-${item.term.toLowerCase().replace(/\s+/g, "-")}`}>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.definition}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-support-heading">
            Support Request
          </h2>
        </div>
        <Card data-testid="card-support-form">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="support-subject">
                  Subject
                </label>
                <Input
                  id="support-subject"
                  placeholder="Brief description of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  data-testid="input-support-subject"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="support-message">
                  Message
                </label>
                <Textarea
                  id="support-message"
                  placeholder="Describe your issue or question in detail"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  data-testid="input-support-message"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Priority
                </label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-support-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal" data-testid="select-item-normal">Normal</SelectItem>
                    <SelectItem value="high" data-testid="select-item-high">High</SelectItem>
                    <SelectItem value="urgent" data-testid="select-item-urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={submitTicket.isPending || !subject.trim() || !message.trim()}
                data-testid="button-submit-support"
              >
                <Send className="w-4 h-4 mr-2" />
                {submitTicket.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
