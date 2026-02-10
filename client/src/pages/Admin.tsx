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
import { Plus, Trash2, Globe, Rss, Loader2, RefreshCw, Twitter, Youtube, Facebook, Instagram } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Admin() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold text-foreground">Admin Settings</h1>
        <p className="text-muted-foreground">Manage data sources and tracking preferences.</p>
      </div>

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
          <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
          <TabsTrigger value="keywords" data-testid="tab-keywords">Keywords</TabsTrigger>
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

  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>News Sources</CardTitle>
          <CardDescription>Configure where NWS360 fetches articles from.</CardDescription>
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
            {isFetchingAll ? "Fetching..." : "Fetch All"}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20" data-testid="button-add-source">
                <Plus className="w-4 h-4" /> Add Source
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Source</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Source Name</Label>
                <Input 
                  id="name" 
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. TechCrunch"
                  required
                  data-testid="input-source-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">
                  {formData.type === 'twitter' ? 'X/Twitter Username or URL' : 
                   formData.type === 'youtube' ? 'YouTube Channel URL or Handle' :
                   formData.type === 'facebook' ? 'Facebook Page URL or Name' :
                   formData.type === 'instagram' ? 'Instagram Username or URL' :
                   formData.type === 'website' ? 'Website URL' : 'RSS Feed URL'}
                </Label>
                <Input 
                  id="url" 
                  value={formData.url}
                  onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder={
                    formData.type === 'twitter' ? '@username or https://x.com/username' :
                    formData.type === 'youtube' ? '@channel or https://youtube.com/@channel' :
                    formData.type === 'facebook' ? 'pagename or https://facebook.com/pagename' :
                    formData.type === 'instagram' ? '@username or https://instagram.com/username' :
                    formData.type === 'website' ? 'https://aljazeera.net' :
                    'https://example.com/feed.xml'
                  }
                  required 
                  data-testid="input-source-url"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(val: any) => setFormData(prev => ({ ...prev, type: val }))}
                  >
                    <SelectTrigger data-testid="select-source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rss">RSS Feed</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="twitter">X / Twitter</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interval">Fetch Interval (mins)</Label>
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
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Source"}
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Fetched</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                    <span className="uppercase">{source.type}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={source.active ? "default" : "secondary"}>
                    {source.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {source.lastFetchedAt 
                    ? formatDistanceToNow(new Date(source.lastFetchedAt), { addSuffix: true })
                    : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
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
        <CardTitle>Tracked Keywords</CardTitle>
        <CardDescription>Add keywords to automatically tag and analyze content.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <Input 
            placeholder="Enter a keyword..." 
            value={term}
            onChange={e => setTerm(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={isCreating || !term}>
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Add Keyword</>}
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
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {keywords?.length === 0 && (
            <p className="text-muted-foreground text-sm italic">No keywords added yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
