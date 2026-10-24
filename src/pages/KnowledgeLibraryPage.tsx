import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Search, FileText, ExternalLink, Loader2, Bookmark, BookmarkCheck, History } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import { useI18n } from "@/lib/i18n";
import { useCloudState } from "@/lib/cloudState";
import { toast } from "sonner";

type Resource = {
  id: string; slug: string; title: string; title_bn: string | null;
  summary: string | null; summary_bn: string | null; content: string | null;
  content_bn: string | null; category: string; resource_type: string;
  tags: string[] | null; language: string | null; source_name: string | null; source_url: string | null;
};

const KnowledgeLibraryPage = () => {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [bookmarks, setBookmarks, syncingBookmarks] = useCloudState<string[]>("civilos.knowledge-bookmarks", []);
  const [readingHistory, setReadingHistory, syncingHistory] = useCloudState<{ id: string; viewedAt: string }[]>("civilos.knowledge-history", []);
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: fetchError } = await supabase.from("knowledge_resources")
        .select("id,slug,title,title_bn,summary,summary_bn,content,content_bn,category,resource_type,tags,language,source_name,source_url")
        .eq("is_published", true).order("created_at", { ascending: false });
      if (!active) return;
      if (fetchError) setError(fetchError.message);
      setResources((data as Resource[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => ["all", ...Array.from(new Set(resources.map(r => r.category).filter(Boolean)))], [resources]);
  const filtered = useMemo(() => resources.filter(r => {
    // Search the full published resource, not just its card summary, so users can find a guide by a phrase inside it.
    const text = [r.title, r.title_bn, r.slug, r.summary, r.summary_bn, r.content, r.content_bn, r.category, r.resource_type, r.language, r.source_name, ...(r.tags || [])]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    const term = query.trim().toLocaleLowerCase();
    return (category === "all" || r.category === category) && text.includes(term) && (!savedOnly || bookmarks.includes(r.id));
  }), [resources, query, category, savedOnly, bookmarks]);

  const toggleBookmark = (resource: Resource) => {
    const isSaved = bookmarks.includes(resource.id);
    setBookmarks((current) => isSaved ? current.filter((id) => id !== resource.id) : [resource.id, ...current.filter((id) => id !== resource.id)]);
    toast.success(isSaved ? (bn ? "বুকমার্ক সরানো হয়েছে" : "Bookmark removed") : (bn ? "রিসোর্স বুকমার্ক করা হয়েছে" : "Resource bookmarked"));
  };
  const openResource = (resource: Resource) => {
    setSelected(resource);
    setReadingHistory((current) => [{ id: resource.id, viewedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== resource.id)].slice(0, 20));
  };
  const recentResources = useMemo(() => readingHistory.map((entry) => ({ entry, resource: resources.find((resource) => resource.id === entry.id) })).filter((item): item is { entry: { id: string; viewedAt: string }; resource: Resource } => Boolean(item.resource)).slice(0, 5), [readingHistory, resources]);
  // Feature only published book/reference resources; never expose drafts in the public library.
  const trendingBooks = useMemo(() => resources
    .filter((resource) => /book|ebook|e-book|pdf|handbook|manual|reference/i.test(resource.resource_type || "")
      || (resource.tags || []).some((tag) => /book|ebook|e-book|pdf|handbook|manual|reference/i.test(tag)))
    .slice(0, 4), [resources]);
  const clearHistory = () => { setReadingHistory([]); toast.success(bn ? "পড়ার ইতিহাস মুছে ফেলা হয়েছে" : "Reading history cleared"); };
  return <SidebarProvider><SEO title={bn ? "জ্ঞান ভান্ডার" : "Knowledge Library"} description="Civil engineering guides, checklists and practical references." />
    <div className="min-h-screen flex w-full bg-background"><DashboardSidebar /><main className="flex-1 min-w-0">
      <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 gap-3"><div className="flex items-center gap-3"><SidebarTrigger /><div><p className="text-xs text-muted-foreground">CivilOS AI</p><h1 className="font-semibold">{bn ? "জ্ঞান ভান্ডার" : "Knowledge Library"}</h1></div></div><div className="flex items-center gap-2"><NotificationBell /><ThemeToggle /></div></header>
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8"><div className="flex items-start gap-4"><div className="rounded-xl bg-primary/10 p-3"><BookOpen className="h-7 w-7 text-primary" /></div><div><h2 className="text-2xl md:text-3xl font-bold">{bn ? "সিভিল ইঞ্জিনিয়ারিং জ্ঞান ভান্ডার" : "Civil Engineering Knowledge Library"}</h2><p className="mt-2 text-muted-foreground max-w-2xl">{bn ? "সাইট চেকলিস্ট, এস্টিমেশন গাইড এবং ব্যবহারিক ইঞ্জিনিয়ারিং রেফারেন্স এক জায়গায়।" : "Practical site checklists, estimation guides and engineering references in one place."}</p></div></div></section>
        {trendingBooks.length > 0 && !savedOnly && !query.trim() && category === "all" && (
          <section aria-labelledby="trending-books-heading" className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-primary">Trending Corner</p>
                <h2 id="trending-books-heading" className="text-xl md:text-2xl font-bold">{bn ? "বই ও ইঞ্জিনিয়ারিং রেফারেন্স" : "Books & Engineering References"}</h2>
                <p className="text-sm text-muted-foreground">{bn ? "প্রকাশিত বই, PDF ও হ্যান্ডবুক থেকে দ্রুত পড়া শুরু করুন।" : "Quick access to published books, PDFs and handbooks in the library."}</p>
              </div>
              <span className="text-xs text-muted-foreground">{trendingBooks.length} {bn ? "টি রিসোর্স" : "resources"}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {trendingBooks.map((resource) => (
                <Card key={resource.id} className="flex flex-col border-primary/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 text-xs text-primary"><BookOpen className="h-4 w-4" />{resource.resource_type}</div>
                    <CardTitle className="text-base line-clamp-2">{bn && resource.title_bn ? resource.title_bn : resource.title}</CardTitle>
                    <CardDescription className="line-clamp-3">{bn && resource.summary_bn ? resource.summary_bn : resource.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button size="sm" onClick={() => openResource(resource)}><BookOpen className="h-4 w-4 mr-2" />{bn ? "বই খুলুন" : "Open resource"}</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
        <div className="flex flex-col md:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder={bn ? "রিসোর্স খুঁজুন..." : "Search resources..."} /></div><select value={category} onChange={e=>setCategory(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{categories.map(c=><option key={c} value={c}>{c==="all"?(bn?"সব ক্যাটাগরি":"All categories"):c}</option>)}</select><Button type="button" variant={savedOnly ? "default" : "outline"} onClick={()=>setSavedOnly(v=>!v)} className="shrink-0"><Bookmark className="h-4 w-4 mr-2"/>{savedOnly ? (bn ? "বুকমার্ক দেখানো হচ্ছে" : "Showing saved") : (bn ? "সেভ করা রিসোর্স" : "Saved resources")} ({bookmarks.length})</Button></div>
        {recentResources.length > 0 && !savedOnly && <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4"/>{bn ? "সম্প্রতি পড়া" : "Recently read"}</CardTitle><CardDescription>{syncingHistory ? (bn ? "ইতিহাস সিঙ্ক হচ্ছে…" : "Syncing reading history…") : (bn ? "সর্বশেষ খোলা ৫টি রিসোর্স" : "Your five most recently opened resources")}</CardDescription></div><Button variant="ghost" size="sm" onClick={clearHistory}>{bn ? "ইতিহাস মুছুন" : "Clear history"}</Button></div></CardHeader><CardContent className="flex flex-wrap gap-2">{recentResources.map(({entry,resource})=><Button key={entry.id} variant="outline" size="sm" onClick={()=>openResource(resource)}>{bn && resource.title_bn ? resource.title_bn : resource.title}</Button>)}</CardContent></Card>}
        {!recentResources.length && syncingBookmarks && <p className="text-xs text-muted-foreground">{bn ? "বুকমার্ক সিঙ্ক হচ্ছে…" : "Syncing bookmarks…"}</p>}
        {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{bn?"লোড হচ্ছে...":"Loading resources..."}</div> : error ? <Card><CardContent className="p-6 text-sm text-destructive">{bn?"রিসোর্স লোড করা যায়নি। ডেটাবেস পারমিশন পরীক্ষা করুন।":"Could not load resources. Check database permissions."}</CardContent></Card> : filtered.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">{bn?"কোনো রিসোর্স পাওয়া যায়নি।":"No resources found."}</CardContent></Card> :
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(r=><Card key={r.id} className="flex flex-col hover:shadow-md transition-shadow"><CardHeader><div className="flex items-center justify-between gap-2"><span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-1">{r.category}</span><span className="text-xs text-muted-foreground">{r.resource_type}</span></div><CardTitle className="text-lg">{bn && r.title_bn ? r.title_bn : r.title}</CardTitle><CardDescription>{bn && r.summary_bn ? r.summary_bn : r.summary}</CardDescription></CardHeader><CardContent className="mt-auto flex items-center gap-2"><Button onClick={()=>openResource(r)} size="sm"><FileText className="h-4 w-4 mr-2" />{bn?"পড়ুন":"Read guide"}</Button><Button onClick={()=>toggleBookmark(r)} variant="outline" size="icon" aria-label={bookmarks.includes(r.id) ? (bn ? "বুকমার্ক সরান" : "Remove bookmark") : (bn ? "বুকমার্ক করুন" : "Bookmark resource")} title={bookmarks.includes(r.id) ? (bn ? "বুকমার্ক সরান" : "Remove bookmark") : (bn ? "বুকমার্ক করুন" : "Bookmark resource")}>{bookmarks.includes(r.id) ? <BookmarkCheck className="h-4 w-4"/> : <Bookmark className="h-4 w-4"/>}</Button>{r.source_url && <Button asChild variant="outline" size="sm"><a href={r.source_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />{bn?"সূত্র":"Source"}</a></Button>}</CardContent></Card>)}</div>}
        {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={()=>setSelected(null)}><Card className="w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><CardHeader><div className="flex justify-between gap-4"><div><CardTitle>{bn && selected.title_bn ? selected.title_bn : selected.title}</CardTitle><CardDescription>{selected.category} · {selected.resource_type}</CardDescription></div><Button variant="outline" onClick={()=>setSelected(null)}>{bn?"বন্ধ করুন":"Close"}</Button></div></CardHeader><CardContent className="whitespace-pre-wrap leading-7">{bn && selected.content_bn ? selected.content_bn : selected.content || (bn && selected.summary_bn ? selected.summary_bn : selected.summary) || ""}</CardContent></Card></div>}
      </div></main></div></SidebarProvider>;
};
export default KnowledgeLibraryPage;
