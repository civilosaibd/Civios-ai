import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { Bot, Sparkles, ShieldCheck, Workflow, FolderKanban, ClipboardCheck, FileText, Calculator, ArrowUpRight, ListChecks, Search, WandSparkles } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import AgentConsole from "@/components/agent/AgentConsole";

export default function UserAgentPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  if (!loading && !user) return <Navigate to="/auth" replace />;

  const capabilities = [
    { icon: FolderKanban, title: T("Workspace context", "ওয়ার্কস্পেস"), text: T("Inspect supported account, plan and project information.", "সমর্থিত account, plan ও project-এর তথ্য পরীক্ষা করুন।") },
    { icon: Calculator, title: T("Engineering workflow", "ইঞ্জিনিয়ারিং workflow"), text: T("Find the right BOQ, estimation and engineering tools.", "সঠিক BOQ, estimation ও engineering tool খুঁজুন।") },
    { icon: FileText, title: T("Research & reporting", "তথ্য ও রিপোর্ট"), text: T("Collect available information and return a clear task report.", "উপলভ্য তথ্য সংগ্রহ করে কাজের পরিষ্কার রিপোর্ট দিন।") },
    { icon: ShieldCheck, title: T("Controlled execution", "নিয়ন্ত্রিত কাজ"), text: T("Permission checks, verification and approval gates for sensitive actions.", "সংবেদনশীল কাজে permission, verification ও approval।") },
  ];
  const taskTypes = [
    { icon: Search, title: T("Investigate", "তথ্য খুঁজুন"), detail: T("Check my plan, enabled features or project context.", "আমার plan, চালু feature বা project-এর তথ্য দেখো।"), prompt: T("Review my current plan and list the features available to me. Clearly separate enabled, locked and coming-soon features.", "আমার বর্তমান plan পরীক্ষা করে available feature-গুলো দেখাও। enabled, locked ও coming-soon আলাদা করে বলো।") },
    { icon: ListChecks, title: T("Plan a workflow", "কাজের পরিকল্পনা"), detail: T("Turn an outcome into ordered, actionable steps.", "লক্ষ্যকে ধারাবাহিক করণীয় ধাপে সাজাও।"), prompt: T("Help me plan a civil engineering workflow. First inspect which relevant tools are available, then give me an actionable sequence and identify any missing inputs.", "একটি civil engineering workflow পরিকল্পনা করো। আগে relevant available tool পরীক্ষা করো, তারপর করণীয় ধাপ ও অনুপস্থিত input জানাও।") },
    { icon: WandSparkles, title: T("Do a task", "কাজ সম্পন্ন করো"), detail: T("Ask the agent to perform supported actions and verify the outcome.", "সমর্থিত কাজ করিয়ে ফল যাচাই করুন।"), prompt: T("Inspect the tools available to my account and identify one useful task you can actually complete now. Perform only safe, supported actions and report verified results and blockers.", "আমার account-এর available tool পরীক্ষা করে এখন বাস্তবে সম্পন্ন করতে পারবে এমন একটি দরকারি কাজ চিহ্নিত করো। শুধু নিরাপদ ও সমর্থিত কাজ করো এবং যাচাইকৃত ফল ও বাধা জানাও।") },
  ];

  return (
    <SidebarProvider>
      <SEO title="AI Agent — CivilOS AI" description="Your personal CivilOS AI task agent for supported engineering workflows, account actions and verified results." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2"><SidebarTrigger /><h1 className="font-heading font-semibold flex items-center gap-2"><Bot className="h-4 w-4 text-primary" />{T("AI Agent", "এআই এজেন্ট")}</h1></div>
            <ThemeToggle />
          </header>
          <main className="p-4 md:p-6 space-y-6 min-w-0 max-w-7xl w-full mx-auto">
            <section className="relative isolate overflow-hidden rounded-2xl border bg-card">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-orange-500/10" />
              <div className="absolute -right-10 -top-14 -z-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
              <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium"><span className="h-2 w-2 rounded-full bg-primary" />{T("CIVILOS AI · TASK EXECUTION WORKSPACE", "CIVILOS AI · কাজ সম্পাদনের workspace")}</div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{T("Give the goal. Get the work done.", "লক্ষ্য দিন। কাজ এগিয়ে নিন।")}</h2>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{T("Your agent can inspect supported CivilOS tools, perform permitted actions, verify available results and explain exactly what is complete or blocked. It will not pretend an unsupported task has been done.", "আপনার এজেন্ট সমর্থিত CivilOS tool পরীক্ষা, অনুমোদিত কাজ সম্পাদন, ফল যাচাই এবং কী সম্পন্ন বা আটকে আছে তা স্পষ্টভাবে জানাতে পারে। সমর্থন নেই এমন কাজ সম্পন্ন হয়েছে বলে দাবি করবে না।")}</p>
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background/80 px-2.5 py-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" />{T("Permission-aware", "অনুমতি যাচাই")}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background/80 px-2.5 py-1.5"><ClipboardCheck className="h-3.5 w-3.5 text-primary" />{T("Verified outcomes", "যাচাইকৃত ফল")}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background/80 px-2.5 py-1.5"><Workflow className="h-3.5 w-3.5 text-primary" />{T("Multi-step workflows", "একাধিক ধাপের কাজ")}</span>
                  </div>
                </div>
                <div className="hidden md:flex h-28 w-28 items-center justify-center rounded-3xl border bg-background/70 shadow-sm"><div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10"><Bot className="h-10 w-10 text-primary" /></div></div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {capabilities.map(({ icon: Icon, title, text }) => (
                <div key={title} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <h3 className="text-sm font-semibold">{title}</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="space-y-1"><h3 className="font-semibold">{T("Start with an outcome", "কী ফল চান তা দিয়ে শুরু করুন")}</h3><p className="text-sm text-muted-foreground">{T("Choose a task pattern or write your own instruction below. The agent only performs actions exposed by the live tool registry.", "একটি কাজ বেছে নিন অথবা নিচে নিজের নির্দেশ লিখুন। এজেন্ট কেবল live tool registry-তে থাকা কাজই করতে পারে।")}</p></div>
              <div className="grid gap-3 md:grid-cols-3">
                {taskTypes.map(({ icon: Icon, title, detail, prompt }) => (
                  <button key={title} type="button" onClick={() => window.dispatchEvent(new CustomEvent("civilos-agent-template", { detail: prompt }))} className="group flex gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-semibold">{title}<ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div><div><h3 className="font-semibold">{T("Agent task console", "এজেন্ট টাস্ক কনসোল")}</h3><p className="text-sm text-muted-foreground">{T("Describe the result you need. For sensitive actions, the agent may require approval; for unsupported actions, it will report the blocker.", "কী ফল দরকার লিখুন। সংবেদনশীল কাজে approval লাগতে পারে; অসমর্থিত কাজের বাধা জানানো হবে।")}</p></div></div>
              <AgentConsole agentType="user" examples={[T("Show my available features", "আমার available features দেখাও"), T("Check whether BIM Studio is available", "BIM Studio available কি না দেখো"), T("Review my projects", "আমার projectগুলো দেখো"), T("Check my current plan", "আমার বর্তমান plan দেখো"), T("Find tools for BOQ and estimation", "BOQ ও estimation-এর tool খুঁজে দাও")]} />
            </section>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
