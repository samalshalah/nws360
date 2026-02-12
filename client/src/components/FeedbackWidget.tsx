import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ThumbsUp, ThumbsDown, MessageSquare, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface FeedbackWidgetProps {
  feature: "briefing" | "alert" | "cluster" | "article";
  targetId: number;
  targetType?: string;
}

type RatingType = "useful" | "unclear" | "wrong" | "helpful" | "noisy" | "accurate" | "inaccurate";

export function FeedbackWidget({ feature, targetId, targetType }: FeedbackWidgetProps) {
  const [selectedRating, setSelectedRating] = useState<RatingType | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const getRatingOptions = (): { rating: RatingType; label: string; icon: typeof ThumbsUp }[] => {
    switch (feature) {
      case "briefing":
      case "cluster":
        return [
          { rating: "useful", label: "Useful", icon: ThumbsUp },
          { rating: "unclear", label: "Unclear", icon: MessageSquare },
          { rating: "wrong", label: "Wrong", icon: ThumbsDown },
        ];
      case "alert":
        return [
          { rating: "helpful", label: "Helpful", icon: ThumbsUp },
          { rating: "noisy", label: "Noisy", icon: ThumbsDown },
        ];
      case "article":
        return [
          { rating: "accurate", label: "Accurate", icon: ThumbsUp },
          { rating: "inaccurate", label: "Inaccurate", icon: ThumbsDown },
        ];
      default:
        return [];
    }
  };

  const feedbackMutation = useMutation({
    mutationFn: async (data: {
      feature: string;
      targetId: number;
      targetType?: string;
      rating: RatingType;
      comment: string;
    }) => {
      const res = await apiRequest("POST", "/api/feedback", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setSubmitted(true);
      setTimeout(() => {
        setSelectedRating(null);
        setComment("");
        setSubmitted(false);
      }, 2000);
    },
  });

  const handleSubmit = () => {
    if (selectedRating) {
      feedbackMutation.mutate({
        feature,
        targetId,
        targetType,
        rating: selectedRating,
        comment,
      });
    }
  };

  const ratingOptions = getRatingOptions();

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <Check className="w-4 h-4" />
        <span>Thank you</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Was this helpful?</span>
      <div className="flex items-center gap-1">
        {ratingOptions.map(({ rating, label, icon: Icon }) => (
          <Button
            key={rating}
            size="sm"
            variant={selectedRating === rating ? "default" : "ghost"}
            onClick={() => setSelectedRating(rating)}
            title={label}
            data-testid={`button-feedback-${rating}`}
            className={selectedRating === rating ? "" : "text-muted-foreground"}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}

        {selectedRating && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                title="Add comment"
                className="text-muted-foreground"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Add a comment (optional)</p>
                <Input
                  placeholder="Your feedback..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="text-xs h-8"
                  data-testid="input-feedback-comment"
                />
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={feedbackMutation.isPending}
                  className="w-full"
                  data-testid="button-feedback-submit"
                >
                  {feedbackMutation.isPending ? "Sending..." : "Submit"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
