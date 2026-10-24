import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { Bot, Sparkles, ShieldCheck, Workflow, FolderKanban, ClipboardCheck, FileText, Calculator } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import AgentConsole from "@/components/agent/AgentConsole";

export default function UserAgentPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  if (!loading && !user) return <Navigate to="/auth" replace />;
  return (
    <SidebarProvider>
      <SEO title="AI Agent — CivilOS AI" description="Your personal CivilOS AI agent: turn features on or off, check your plan, projects and settings in Bangla or English." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger />
              <h1 className="font-heading font-semibold flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> {T("AI Agent", "এআই এজেন্ট")}</h1>
            </div>
            <ThemeToggle />
          </header>
          <main className="p-4 md:p-6 space-y-5 min-w-0 max-w-6xl w-full mx-auto">
            <section className="relative overflow-hidden rounded-2xl border bg-card p-5 md:p-7">
              <div className="absolute right-4 top-4 opacity-10"><Sparkles className="h-24 w-24" /></div>
              <div className="relative max-w-3xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {T("CivilOS AI • Agent workspace", "CivilOS AI • এজেন্ট ওয়ার্কস্পেস")}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{T("From engineering intent to verified action.", "ইঞ্জিনিয়ারিং নির্দেশনা থেকে যাচাইকৃত কাজ।")}</h2>
                <p className="text-sm md:text-base text-muted-foreground max-w-2xl">{T("Ask the agent to inspect your workspace, find available tools, organize project work and perform supported account actions. It checks permissions and reports the actual result.", "আপনার workspace পরীক্ষা, available tools খোঁজা, project work সাজানো এবং সমর্থিত account action-এর জন্য এজেন্টকে নির্দেশ দিন। এটি permission যাচাই করে এবং প্রকৃত ফল জানায়।")}</p>
                <div className="flex flex-wrap gap-2 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-background/80 border px-2 py-1"><ShieldCheck className="h-3.5 w-3.5" />{T("Permission checked", "অনুমতি যাচাই")}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-background/80 border px-2 py-1"><ClipboardCheck className="h-3.5 w-3.5" />{T("Result verified", "ফল যাচাই")}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-background/80 border px-2 py-1"><Workflow className="h-3.5 w-3.5" />{T("Tool-based workflows", "টুল-ভিত্তিক workflow")}</span>
                </div>
              </div>
            </section>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { icon: FolderKanban, title: T("Project workspace", "প্রজেক্ট workspace"), text: T("Review your projects and account context", "প্রজেক্ট ও account context দেখুন") },
                { icon: Calculator, title: T("Engineering tools", "ইঞ্জিনিয়ারিং টুল"), text: T("Find tools for quantity, BOQ and estimates", "quantity, BOQ ও estimate-এর টুল খুঁজুন") },
                { icon: FileText, title: T("Knowledge & reports", "তথ্য ও রিপোর্ট"), text: T("Locate supported documents and workflows", "সমর্থিত document ও workflow খুঁজুন") },
                { icon: ShieldCheck, title: T("Controlled actions", "নিয়ন্ত্রিত কাজ"), text: T("Restricted actions require the right approval", "সীমাবদ্ধ কাজে যথাযথ অনুমোদন লাগে") },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border bg-card p-4 space-y-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </section>
            <section className="space-y-2">
              <div><h3 className="font-semibold">{T("Agent console", "এজেন্ট কনসোল")}</h3><p className="text-sm text-muted-foreground">{T("Choose a suggested task or describe what you need. Available actions depend on connected tools and your permissions.", "একটি প্রস্তাবিত কাজ বেছে নিন বা কী দরকার লিখুন। কাজের সুযোগ connected tools ও আপনার permission-এর ওপর নির্ভর করে।")}</p></div>
              <AgentConsole agentType="user" examples={["আমার available features দেখাও", "BIM Studio চালু আছে?", "আমার projectগুলো দেখাও", "আমার plan কী?", "BOQ ও estimation-এর জন্য কোন tools available?", "আমার account-এর notification settings দেখাও"]} />
            </section>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
