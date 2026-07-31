import { useMemo } from "react";
import {
  Building2,
  ChevronRight,
  Globe2,
  Landmark,
  Newspaper,
  Scale,
  ShieldAlert,
  Users,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useArticles } from "@/hooks/use-articles";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { getArticleCategoryLabel } from "@shared/article-taxonomy";
import { useEmbassyProfile } from "@/hooks/use-embassy-profile";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

type FeedMagazineProps = {
  latestArticles: any[];
  total?: number;
  isLoading: boolean;
  startDate?: string;
  endDate?: string;
  activeCategory?: string;
  onSelectCategory: (category?: string) => void;
  onOpenListView: () => void;
};

type CategoryConfig = {
  code: string;
  label: string;
  description: string;
  icon: typeof Newspaper;
};

const CATEGORY_NAV: CategoryConfig[] = [
  {
    code: "iraqi_government",
    label: "Iraqi Government",
    description: "Prime Minister, cabinet, ministries, and official state decisions.",
    icon: Building2,
  },
  {
    code: "parliament_politics",
    label: "Parliament & Political Affairs",
    description: "Parliament, parties, elections, coalitions, and political negotiations.",
    icon: Landmark,
  },
  {
    code: "security_stability",
    label: "Security & Stability",
    description: "Military, armed groups, incidents, and public safety signals.",
    icon: ShieldAlert,
  },
  {
    code: "economy_oil_finance",
    label: "Economy, Oil & Public Finance",
    description: "Budget, oil, currency, banking, salaries, and economic policy.",
    icon: WalletCards,
  },
  {
    code: "development_services",
    label: "Development & Public Services",
    description: "Infrastructure, electricity, water, health, education, and services.",
    icon: Building2,
  },
  {
    code: "justice_accountability",
    label: "Justice & Accountability",
    description: "Courts, corruption, integrity investigations, and rule-of-law issues.",
    icon: Scale,
  },
  {
    code: "kurdistan_region",
    label: "Kurdistan Region",
    description: "KRG institutions, Erbil-Baghdad files, oil, salaries, and Peshmerga.",
    icon: Globe2,
  },
  {
    code: "civil_society_humanitarian",
    label: "Civil Society & Humanitarian",
    description: "NGOs, humanitarian affairs, human rights, protests, and public opinion.",
    icon: Users,
  },
  {
    code: "united_nations",
    label: "UN & International Organizations",
    description: "UNAMI, UN agencies, multilateral programs, and institutional statements.",
    icon: Globe2,
  },
  {
    code: "client_bilateral_relations",
    label: "Bilateral Relations",
    description: "Tenant embassy relations with Iraq, including statements, visits, agreements, and consular issues.",
    icon: Globe2,
  },
  {
    code: "regional_international_relations",
    label: "Regional & International Relations",
    description: "Iraq's diplomacy with neighboring states, regional powers, and foreign governments.",
    icon: Globe2,
  },
  {
    code: "media_narratives",
    label: "Media Narratives & Social Trends",
    description: "Media narratives, coordinated campaigns, hashtags, and viral discourse.",
    icon: Newspaper,
  },
  {
    code: "other",
    label: "Other",
    description: "Items outside the defined diplomatic report taxonomy.",
    icon: Scale,
  },
];

const MAGAZINE_SECTIONS = CATEGORY_NAV.filter((item) => item.code !== "other").slice(0, 6);

function categoryQueryParams(code: string, startDate?: string, endDate?: string, limit = 4) {
  return {
    category: code,
    sort: "newest" as const,
    startDate,
    endDate,
    limit,
  };
}

function storyText(article: any): string {
  return [
    article?.title,
    article?.summary,
    article?.content,
    article?.subSource,
    article?.source?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pickMatchingArticles(articles: any[], pattern: RegExp, fallbackStart = 0, limit = 3) {
  const matched = articles.filter((article) => pattern.test(storyText(article)));
  const source = matched.length > 0 ? matched : articles.slice(fallbackStart);
  return source.slice(0, limit);
}

function MagazineCategorySection({
  config,
  startDate,
  endDate,
  active,
  onSelectCategory,
}: {
  config: CategoryConfig;
  startDate?: string;
  endDate?: string;
  active: boolean;
  onSelectCategory: (category?: string) => void;
}) {
  const embassyProfile = useEmbassyProfile();
  const { data, isLoading } = useArticles(categoryQueryParams(config.code, startDate, endDate, 4));
  const articles = data?.items || [];
  const Icon = config.icon;
  const categoryLabel = getArticleCategoryLabel(config.code, embassyProfile);

  return (
    <section className={cn("rounded-md border bg-card", active ? "border-primary/60" : "border-border/60")} data-testid={`magazine-section-${config.code}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">{categoryLabel}</h2>
            {typeof data?.total === "number" && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">{data.total}</Badge>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{config.description}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onSelectCategory(config.code)}>
          View
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-3 p-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-md" />)
        ) : articles.length > 0 ? (
          articles.slice(0, 3).map((article: any) => <ArticleCard key={article.id} article={article} layout="compact" />)
        ) : (
          <p className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            No recent {categoryLabel.toLowerCase()} items in this period.
          </p>
        )}
      </div>
    </section>
  );
}

function InstitutionLane({
  title,
  description,
  articles,
  category,
  onSelectCategory,
}: {
  title: string;
  description: string;
  articles: any[];
  category: string;
  onSelectCategory: (category?: string) => void;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-card" data-testid={`institution-lane-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onSelectCategory(category)}>
          View
        </Button>
      </div>
      <div className="space-y-3 p-4">
        {articles.length > 0 ? (
          articles.map((article: any) => <ArticleCard key={article.id} article={article} layout="compact" />)
        ) : (
          <p className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            No recent items matched this institution lane.
          </p>
        )}
      </div>
    </section>
  );
}

function GovernmentDesk({
  startDate,
  endDate,
  onSelectCategory,
}: {
  startDate?: string;
  endDate?: string;
  onSelectCategory: (category?: string) => void;
}) {
  const government = useArticles(categoryQueryParams("iraqi_government", startDate, endDate, 36));
  const parliament = useArticles(categoryQueryParams("parliament_politics", startDate, endDate, 12));
  const organizations = useArticles(categoryQueryParams("united_nations", startDate, endDate, 12));
  const civilSociety = useArticles(categoryQueryParams("civil_society_humanitarian", startDate, endDate, 12));
  const governmentArticles = government.data?.items || [];
  const parliamentArticles = parliament.data?.items || [];
  const organizationArticles = [...(organizations.data?.items || []), ...(civilSociety.data?.items || [])].slice(0, 12);
  const isLoading = government.isLoading || parliament.isLoading || organizations.isLoading || civilSociety.isLoading;

  const lanes = [
    {
      title: "Prime Minister & Cabinet",
      description: "Executive decisions, cabinet meetings, and prime minister activity.",
      category: "iraqi_government",
      articles: pickMatchingArticles(
        governmentArticles,
        /رئيس الوزراء|مجلس الوزراء|رئاسة الوزراء|الحكومة|السوداني|prime minister|premier|cabinet/i,
        0,
        3
      ),
    },
    {
      title: "Ministries",
      description: "Ministry statements, services, appointments, and public-sector activity.",
      category: "iraqi_government",
      articles: pickMatchingArticles(
        governmentArticles,
        /وزارة|الوزارة|وزير|الوزير|ministry|minister/i,
        3,
        3
      ),
    },
    {
      title: "Parliament & Law",
      description: "Legislation, committees, courts, and formal legal decisions.",
      category: "parliament_politics",
      articles: parliamentArticles.slice(0, 3),
    },
    {
      title: "Organizations & Civil Society",
      description: "UN agencies, international organizations, NGOs, and public opinion signals.",
      category: "united_nations",
      articles: organizationArticles.slice(0, 3),
    },
  ];

  return (
    <section className="space-y-4" data-testid="magazine-government-desk">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Government & Institutions</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A diplomatic watchlist for executive offices, ministries, parliament, and organizations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onSelectCategory("iraqi_government")}>
          Open government feed
        </Button>
      </div>
      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-md" />)}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {lanes.map((lane) => (
            <InstitutionLane key={lane.title} {...lane} onSelectCategory={onSelectCategory} />
          ))}
        </div>
      )}
    </section>
  );
}

export function FeedMagazine({
  latestArticles,
  total,
  isLoading,
  startDate,
  endDate,
  activeCategory,
  onSelectCategory,
  onOpenListView,
}: FeedMagazineProps) {
  const embassyProfile = useEmbassyProfile();
  const defaultStartDate = useMemo(() => new Date(Date.now() - 7 * DAY_MS).toISOString(), []);
  const effectiveStartDate = startDate || defaultStartDate;
  const leadArticle = latestArticles.find((article) => article.imageUrl && article.imageUrl !== "none") || latestArticles[0];
  const latestStream = latestArticles.slice(0, 8);

  return (
    <div className="space-y-6" data-testid="feed-magazine-front">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">Front Page</h1>
              {typeof total === "number" && (
                <Badge variant="outline" className="tabular-nums">{total.toLocaleString()} monitored articles</Badge>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Latest developments organized like a daily news brief for embassy, NGO, and newsroom monitoring.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenListView}>
            Open article stream
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" data-testid="magazine-category-nav">
          <Button
            variant={!activeCategory ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectCategory(undefined)}
          >
            Home
          </Button>
          {CATEGORY_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.code}
                variant={activeCategory === item.code ? "default" : "outline"}
                size="sm"
                onClick={() => onSelectCategory(item.code)}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {getArticleCategoryLabel(item.code, embassyProfile)}
              </Button>
            );
          })}
        </div>
      </section>

      <section data-testid="magazine-top-stories">
        {isLoading ? (
          <Skeleton className="min-h-[360px] rounded-md" />
        ) : leadArticle ? (
          <ArticleCard article={leadArticle} layout="headline" />
        ) : (
          <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
            No articles available for this view.
          </div>
        )}
      </section>

      <GovernmentDesk startDate={effectiveStartDate} endDate={endDate} onSelectCategory={onSelectCategory} />

      <section className="space-y-4" data-testid="magazine-category-shelves">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Latest by Category</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the subject lane first, then drill into the full article stream when needed.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {MAGAZINE_SECTIONS.map((config) => (
            <MagazineCategorySection
              key={config.code}
              config={config}
              startDate={effectiveStartDate}
              endDate={endDate}
              active={activeCategory === config.code}
              onSelectCategory={onSelectCategory}
            />
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-card" data-testid="magazine-latest-stream">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {activeCategory ? `${getArticleCategoryLabel(activeCategory, embassyProfile)} Stream` : "Latest Stream"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">The current filtered feed, shown as a scan list.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenListView}>
            Full list
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-md" />)
          ) : latestStream.length > 0 ? (
            latestStream.map((article: any) => <ArticleCard key={article.id} article={article} layout="compact" />)
          ) : (
            <p className="col-span-full rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
              No articles match the selected filters.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
