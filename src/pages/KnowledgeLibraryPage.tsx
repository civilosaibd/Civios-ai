import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Search, FileText, ExternalLink, Loader2 } from "lucide-react";
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
    const text = [r.title, r.title_bn, r.summary, r.summary_bn, r.category, ...(r.tags || [])].join(" ").toLowerCase();
    return (category === "all" || r.category === category) && text.includes(query.toLowerCase().trim());
  }), [resources, query, category]);

  return <SidebarProvider><SEO title={bn ? "জ্ঞান ভান্ডার" : "Knowledge Library"} description="Civil engineering guides, checklists and practical references." />
    <div className="min-h-screen flex w-full bg-background"><DashboardSidebar /><main className="flex-1 min-w-0">
      <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 gap-3"><div className="flex items-center gap-3"><SidebarTrigger /><div><p className="text-xs text-muted-foreground">CivilOS AI</p><h1 className="font-semibold">{bn ? "জ্ঞান ভান্ডার" : "Knowledge Library"}</h1></div></div><div className="flex items-center gap-2"><NotificationBell /><ThemeToggle /></div></header>
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8"><div className="flex items-start gap-4"><div className="rounded-xl bg-primary/10 p-3"><BookOpen className="h-7 w-7 text-primary" /></div><div><h2 className="text-2xl md:text-3xl font-bold">{bn ? "সিভিল ইঞ্জিনিয়ারিং জ্ঞান ভান্ডার" : "Civil Engineering Knowledge Library"}</h2><p className="mt-2 text-muted-foreground max-w-2xl">{bn ? "সাইট চেকলিস্ট, এস্টিমেশন গাইড এবং ব্যবহারিক ইঞ্জিনিয়ারিং রেফারেন্স এক জায়গায়।" : "Practical site checklists, estimation guides and engineering references in one place."}</p></div></div></section>
        <div className="flex flex-col md:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder={bn ? "রিসোর্স খুঁজুন..." : "Search resources..."} /></div><select value={category} onChange={e=>setCategory(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{categories.map(c=><option key={c} value={c}>{c==="all"?(bn?"সব ক্যাটাগরি":"All categories"):c}</option>)}</select></div>
        {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{bn?"লোড হচ্ছে...":"Loading resources..."}</div> : error ? <Card><CardContent className="p-6 text-sm text-destructive">{bn?"রিসোর্স লোড করা যায়নি। ডেটাবেস পারমিশন পরীক্ষা করুন।":"Could not load resources. Check database permissions."}</CardContent></Card> : filtered.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">{bn?"কোনো রিসোর্স পাওয়া যায়নি।":"No resources found."}</CardContent></Card> :
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(r=><Card key={r.id} className="flex flex-col hover:shadow-md transition-shadow"><CardHeader><div className="flex items-center justify-between gap-2"><span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-1">{r.category}</span><span className="text-xs text-muted-foreground">{r.resource_type}</span></div><CardTitle className="text-lg">{bn && r.title_bn ? r.title_bn : r.title}</CardTitle><CardDescription>{bn && r.summary_bn ? r.summary_bn : r.summary}</CardDescription></CardHeader><CardContent className="mt-auto flex items-center gap-2"><Button onClick={()=>setSelected(r)} size="sm"><FileText className="h-4 w-4 mr-2" />{bn?"পড়ুন":"Read guide"}</Button>{r.source_url && <Button asChild variant="outline" size="sm"><a href={r.source_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />{bn?"সূত্র":"Source"}</a></Button>}</CardContent></Card>)}</div>}
        {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={()=>setSelected(null)}><Card className="w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><CardHeader><div className="flex justify-between gap-4"><div><CardTitle>{bn && selected.title_bn ? selected.title_bn : selected.title}</CardTitle><CardDescription>{selected.category} · {selected.resource_type}</CardDescription></div><Button variant="outline" onClick={()=>setSelected(null)}>{bn?"বন্ধ করুন":"Close"}</Button></div></CardHeader><CardContent className="whitespace-pre-wrap leading-7">{bn && selected.content_bn ? selected.content_bn : selected.content || (bn && selected.summary_bn ? selected.summary_bn : selected.summary) || ""}</CardContent></Card></div>}
      </div></main></div></SidebarProvider>;
};
export default KnowledgeLibraryPage;
