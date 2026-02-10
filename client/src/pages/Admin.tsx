import { useState } from "react";
import { useSources, useCreateSource, useDeleteSource, useFetchSource, useFetchAllSources } from "@/hooks/use-sources";
import { useKeywords, useCreateKeyword, useDeleteKeyword } from "@/hooks/use-keywords";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Globe, Rss, Loader2, RefreshCw, Twitter, Youtube, Facebook, Instagram, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";

export default function Admin() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-title">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
          <TabsTrigger value="sources" data-testid="tab-sources">{t("admin.sources")}</TabsTrigger>
          <TabsTrigger value="keywords" data-testid="tab-keywords">{t("admin.keywords")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <SourcesManager />
        </TabsContent>

        <TabsContent value="keywords">
          <KeywordsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SourcesManager() {
  const { t } = useTranslation();
  const { data: sources, isLoading } = useSources();
  const { mutate: createSource, isPending: isCreating } = useCreateSource();
  const { mutate: deleteSource, isPending: isDeleting } = useDeleteSource();
  const { mutate: fetchSource, isPending: isFetchingOne, variables: fetchingSourceId } = useFetchSource();
  const { mutate: fetchAll, isPending: isFetchingAll } = useFetchAllSources();
  const [isOpen, setIsOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    type: "rss" as string,
    intervalMinutes: 15
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSource(formData, {
      onSuccess: () => {
        setIsOpen(false);
        setFormData({ name: "", url: "", type: "rss" as string, intervalMinutes: 15 });
      }
    });
  };

  const sourceTypes: Record<string, string> = {
    rss: t("admin.rss"),
    website: t("admin.website"),
    twitter: t("admin.twitter"),
    youtube: t("admin.youtube"),
    facebook: t("admin.facebook"),
    instagram: t("admin.instagram"),
    telegram: t("admin.telegram"),
  };

  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>{t("admin.newsSources")}</CardTitle>
          <CardDescription>{t("admin.sourcesDescription")}</CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={() => fetchAll()} 
            disabled={isFetchingAll}
            data-testid="button-fetch-all"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingAll ? "animate-spin" : ""}`} />
            {isFetchingAll ? t("admin.fetching") : t("admin.fetchAll")}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20" data-testid="button-add-source">
                <Plus className="w-4 h-4" /> {t("admin.addSource")}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("admin.addNewSource")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("admin.sourceName")}</Label>
                <Input 
                  id="name" 
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t("admin.sourceNamePlaceholder")}
                  required
                  data-testid="input-source-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">
                  {t(`admin.urlLabels.${formData.type}` as any)}
                </Label>
                <Input 
                  id="url" 
                  value={formData.url}
                  onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder={t(`admin.urlPlaceholders.${formData.type}` as any)}
                  required 
                  data-testid="input-source-url"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{t("admin.type")}</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(val: any) => setFormData(prev => ({ ...prev, type: val }))}
                  >
                    <SelectTrigger data-testid="select-source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rss">{t("admin.rss")}</SelectItem>
                      <SelectItem value="website">{t("admin.website")}</SelectItem>
                      <SelectItem value="twitter">{t("admin.twitter")}</SelectItem>
                      <SelectItem value="youtube">{t("admin.youtube")}</SelectItem>
                      <SelectItem value="facebook">{t("admin.facebook")}</SelectItem>
                      <SelectItem value="instagram">{t("admin.instagram")}</SelectItem>
                      <SelectItem value="telegram">{t("admin.telegram")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interval">{t("admin.fetchInterval")}</Label>
                  <Input 
                    id="interval" 
                    type="number" 
                    min={5}
                    value={formData.intervalMinutes}
                    onChange={e => setFormData(prev => ({ ...prev, intervalMinutes: parseInt(e.target.value) }))}
                    required
                    data-testid="input-source-interval"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isCreating} data-testid="button-submit-source">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.addSource")}
              </Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.sourceName")}</TableHead>
              <TableHead>{t("admin.type")}</TableHead>
              <TableHead>{t("admin.status")}</TableHead>
              <TableHead>{t("admin.lastFetched")}</TableHead>
              <TableHead className="text-right rtl:text-left">{t("admin.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources?.map((source) => (
              <TableRow key={source.id}>
                <TableCell className="font-medium">{source.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    {source.type === 'rss' && <Rss className="w-3.5 h-3.5" />}
                    {source.type === 'website' && <Globe className="w-3.5 h-3.5" />}
                    {source.type === 'twitter' && <Twitter className="w-3.5 h-3.5" />}
                    {source.type === 'youtube' && <Youtube className="w-3.5 h-3.5" />}
                    {source.type === 'facebook' && <Facebook className="w-3.5 h-3.5" />}
                    {source.type === 'instagram' && <Instagram className="w-3.5 h-3.5" />}
                    {source.type === 'telegram' && <Send className="w-3.5 h-3.5" />}
                    <span className="uppercase">{sourceTypes[source.type] || source.type}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={source.active ? "default" : "secondary"}>
                    {source.active ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {source.lastFetchedAt 
                    ? formatDistanceToNow(new Date(source.lastFetchedAt), { addSuffix: true })
                    : t("common.never")}
                </TableCell>
                <TableCell className="text-right rtl:text-left">
                  <div className="flex items-center justify-end rtl:justify-start gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => fetchSource(source.id)}
                      disabled={isFetchingOne && fetchingSourceId === source.id}
                      data-testid={`button-fetch-source-${source.id}`}
                    >
                      <RefreshCw className={`w-4 h-4 ${isFetchingOne && fetchingSourceId === source.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive"
                      onClick={() => deleteSource(source.id)}
                      disabled={isDeleting}
                      data-testid={`button-delete-source-${source.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function KeywordsManager() {
  const { t } = useTranslation();
  const { data: keywords, isLoading } = useKeywords();
  const { mutate: createKeyword, isPending: isCreating } = useCreateKeyword();
  const { mutate: deleteKeyword, isPending: isDeleting } = useDeleteKeyword();
  
  const [term, setTerm] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    createKeyword({ term }, { onSuccess: () => setTerm("") });
  };

  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader>
        <CardTitle>{t("admin.trackedKeywords")}</CardTitle>
        <CardDescription>{t("admin.keywordsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <Input 
            placeholder={t("admin.enterKeyword")}
            value={term}
            onChange={e => setTerm(e.target.value)}
            className="flex-1"
            data-testid="input-keyword"
          />
          <Button type="submit" disabled={isCreating || !term} data-testid="button-add-keyword">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t("admin.addKeyword")}</>}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {keywords?.map((keyword) => (
            <div 
              key={keyword.id}
              className="flex items-center gap-2 bg-muted/50 border border-border px-3 py-1.5 rounded-full text-sm font-medium"
            >
              {keyword.term}
              <button 
                onClick={() => deleteKeyword(keyword.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                disabled={isDeleting}
                data-testid={`button-delete-keyword-${keyword.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {keywords?.length === 0 && (
            <p className="text-muted-foreground text-sm italic">{t("admin.noKeywords")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
