import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Radar, 
  Brain, 
  TrendingUp, 
  Building2, 
  Landmark, 
  Shield as ShieldIcon, 
  GraduationCap, 
  Lock, 
  Users, 
  Eye, 
  Cpu, 
  ArrowRight,
  Activity,
  BarChart3,
  Newspaper,
  Globe,
  Zap,
  Radio
} from "lucide-react";

function MiniBarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm"
          style={{
            height: `${(v / max) * 100}%`,
            backgroundColor: color,
            opacity: 0.5 + (v / max) * 0.5,
          }}
        />
      ))}
    </div>
  );
}

function DashboardMock() {
  const barData = [4, 7, 5, 9, 6, 8, 3, 7, 10, 6, 8, 5];
  const sentimentData = [
    { label: "Positive", pct: 42, color: "hsl(var(--chart-2))" },
    { label: "Neutral", pct: 35, color: "hsl(var(--chart-1))" },
    { label: "Negative", pct: 23, color: "hsl(var(--chart-5))" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 w-full max-w-md">
      <Card className="p-3 col-span-2 border-border/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Coverage Volume</span>
          <Activity className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="flex items-end gap-0.5 h-12">
          {barData.map((v, i) => (
            <div key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${(v / 10) * 100}%` }} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-xs font-semibold text-foreground">1,247</span>
          <span className="text-[10px] text-chart-2">+12.3%</span>
        </div>
      </Card>

      <Card className="p-3 border-border/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sentiment</span>
          <BarChart3 className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          {sentimentData.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
                <span className="text-[10px] font-medium text-foreground">{s.pct}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted mt-0.5">
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-3 border-border/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sources</span>
          <Globe className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          {["RSS Feeds", "Social Media", "YouTube Channels"].map((src, i) => (
            <div key={src} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `hsl(var(--chart-${i + 1}))` }} />
              <span className="text-[10px] text-muted-foreground flex-1">{src}</span>
              <span className="text-[10px] font-medium text-foreground">{[38, 24, 12][i]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-3 col-span-2 border-border/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trending Signals</span>
          <Zap className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          {[
            { topic: "Energy Policy", momentum: 87 },
            { topic: "Trade Relations", momentum: 72 },
            { topic: "Cybersecurity", momentum: 65 },
          ].map((t) => (
            <div key={t.topic} className="flex items-center gap-2">
              <span className="text-[10px] text-foreground flex-1 truncate">{t.topic}</span>
              <MiniBarChart data={[3, 5, 4, 7, 6, 8, t.momentum / 10]} color="hsl(var(--primary))" />
              <span className="text-[10px] font-medium text-primary w-6 text-right">{t.momentum}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-base">
              N
            </div>
            <span className="text-lg font-bold tracking-tight">
              NWS<span className="text-primary">360</span>
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/demo">
              <Button variant="ghost" size="sm" data-testid="link-header-demo">Demo</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm" data-testid="link-header-login">Login</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="py-16 md:py-24" data-testid="section-hero">
        <div className="max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="flex-1 space-y-6">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
              Understand the World<br />
              <span className="text-primary">Before It Happens</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-lg">
              AI-powered monitoring across news websites, RSS feeds, YouTube, and social media - organized into signals, narratives, and forecasts.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link href="/demo">
                <Button size="lg" data-testid="button-hero-demo">
                  Open Live Demo
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" data-testid="button-hero-login">Login</Button>
              </Link>
            </div>
          </div>
          <div className="flex-1 flex justify-center lg:justify-end">
            <DashboardMock />
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border/30" data-testid="section-features">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl md:text-2xl font-bold mb-2">What the System Does</h2>
          <p className="text-sm text-muted-foreground mb-8">Three core capabilities, running continuously.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: Radar,
                title: "Monitor",
                desc: "Track hundreds of media sources in real time - RSS, news websites, YouTube channels, social feeds, and government sources.",
                stats: "74 active sources",
              },
              {
                icon: Brain,
                title: "Analyze",
                desc: "AI extracts entities, sentiment, story clusters, and narrative frames from every ingested article.",
                stats: "GPT-4o-mini pipeline",
              },
              {
                icon: TrendingUp,
                title: "Predict",
                desc: "Detect narrative shifts, early warning signals, and topic trajectory changes before they reach mainstream.",
                stats: "24h / 7d forecasts",
              },
            ].map((f) => (
              <Card key={f.title} className="p-5 border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{f.desc}</p>
                <div className="text-[10px] font-medium text-primary/70 uppercase tracking-wider">{f.stats}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border/30" data-testid="section-demo-explain">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="max-w-xl mx-auto space-y-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <Radio className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold">Live Data Demo</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Open a read-only live feed of aggregated sources. See real articles flowing in, AI analysis running, and signals forming — no signup required.
            </p>
            <Link href="/demo">
              <Button size="lg" className="mt-2" data-testid="button-demo-enter">
                Enter Demo Feed
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border/30" data-testid="section-audience">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl md:text-2xl font-bold mb-2">Who It Is For</h2>
          <p className="text-sm text-muted-foreground mb-8">Built for teams that need structured media intelligence.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Newspaper, title: "Media Organizations", desc: "Newsrooms tracking coverage, competition, and narrative spread." },
              { icon: Landmark, title: "Government & Policy", desc: "Policy teams monitoring public discourse and information flows." },
              { icon: Building2, title: "Corporate Intelligence", desc: "Risk and strategy teams tracking brand, sector, and competitor signals." },
              { icon: GraduationCap, title: "Research Teams", desc: "Academics and analysts studying media ecosystems and information dynamics." },
            ].map((a) => (
              <Card key={a.title} className="p-4 border-border/50">
                <a.icon className="w-5 h-5 text-primary mb-3" />
                <h3 className="text-sm font-semibold mb-1">{a.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{a.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border/30" data-testid="section-security">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl md:text-2xl font-bold mb-2">Security & Trust</h2>
          <p className="text-sm text-muted-foreground mb-8">Enterprise-grade data isolation by design.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Lock, title: "Multi-tenant Isolation", desc: "Complete data separation between organizations at the database level." },
              { icon: Users, title: "Client-level Scoping", desc: "Every query, article, and source is scoped to the authenticated client." },
              { icon: Eye, title: "No Cross-visibility", desc: "Zero data leakage between organizations. Strict access boundaries." },
              { icon: Cpu, title: "Per-client AI", desc: "AI analysis pipelines run independently per client context." },
            ].map((s) => (
              <Card key={s.title} className="p-4 border-border/50">
                <s.icon className="w-5 h-5 text-primary mb-3" />
                <h3 className="text-sm font-semibold mb-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 border-t border-border/30" data-testid="section-cta">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-xl md:text-2xl font-bold mb-3">Start Monitoring Your Information Space</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Deploy your own intelligence workspace. Track what matters. Act before others react.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/login">
              <Button size="lg" data-testid="button-cta-login">Login</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" data-testid="button-cta-request">Request Access</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/30 py-6">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} NWS360. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
