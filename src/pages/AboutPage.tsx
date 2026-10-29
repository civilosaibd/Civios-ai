import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { ArrowRight, Building2, Calculator, ClipboardCheck, Compass, FileSpreadsheet, Layers3, ShieldCheck, Sparkles } from "lucide-react";

const capabilities = [
  {
    icon: Calculator,
    title: "Construction estimation",
    description: "Explore project inputs, indicative costs, cost-per-square-foot and planning assumptions in one place.",
  },
  {
    icon: FileSpreadsheet,
    title: "BOQ & quantity workflows",
    description: "Organize quantities and item-level information to support clearer estimating and review.",
  },
  {
    icon: Building2,
    title: "Civil engineering workspace",
    description: "Bring project-focused tools and engineering resources together as your workflow grows.",
  },
  {
    icon: ClipboardCheck,
    title: "Reports & project review",
    description: "Review estimate summaries and supporting outputs before sharing them with your team.",
  },
];

const principles = [
  { icon: Compass, title: "Clear assumptions", description: "Make inputs, units and estimating assumptions easier to understand." },
  { icon: ShieldCheck, title: "Professional review matters", description: "Treat generated figures as planning aids—not a substitute for qualified engineering judgment." },
  { icon: Layers3, title: "One connected workflow", description: "Move from project inputs to quantities and reports with less friction." },
];

const AboutPage = () => {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="About CivilOS AI"
        description="Discover CivilOS AI, a project-focused AI civil engineering workspace for construction estimation, BOQ, quantities and planning workflows in Bangladesh."
        path="/about"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About CivilOS AI",
          url: "https://civilosai.pro.bd/about",
          isPartOf: { "@type": "WebSite", name: "CivilOS AI", url: "https://civilosai.pro.bd/" },
        }}
      />
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-accent/10">
          <div className="container max-w-6xl py-16 md:py-24">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" /> AI-powered civil engineering workspace
              </div>
              <h1 className="font-heading text-4xl font-bold tracking-tight md:text-6xl">
                {t("about.title") || "Engineering projects, made clearer."}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                CivilOS AI brings construction estimation, quantity workflows and project-focused engineering tools into one workspace—helping users organize information and understand their next steps.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/estimate/demo">Explore demo estimate <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/contact">Talk to our team</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Estimates are indicative planning outputs. Verify quantities, local rates, design assumptions and structural calculations with qualified professionals before construction.
              </p>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-14 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">What we are building</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">A more connected way to work on civil projects</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Civil engineering work often involves scattered inputs, quantity calculations, cost references and reports. CivilOS AI is designed to bring these steps closer together in a practical, project-oriented digital workspace, with a focus on workflows relevant to Bangladesh.
            </p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border bg-card p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-md">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/30">
          <div className="container max-w-6xl py-14 md:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">How we approach the work</p>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">Useful tools, transparent limits</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Good engineering decisions depend on understandable inputs and responsible review. We aim to make digital workflows more approachable while keeping professional verification at the center.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {principles.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4 rounded-2xl border bg-card p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-14 md:py-20">
          <div className="grid items-center gap-8 rounded-3xl border bg-card p-6 shadow-sm md:grid-cols-[1fr_auto] md:p-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">The person behind the project</p>
              <h2 className="mt-3 font-heading text-2xl font-bold">{t("about.developedBy") || "Developed by"}</h2>
              <p className="mt-2 text-xl font-semibold">{t("about.devName") || "Md Zobaer Hasan"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("about.devRole") || "Civil engineering student and digital product builder"}</p>
              <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
                CivilOS AI is an evolving project focused on making civil engineering and construction workflows more accessible through useful digital tools.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <Button asChild><Link to="/estimate/demo">Try the demo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button variant="outline" asChild><Link to="/contact">Contact CivilOS AI</Link></Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AboutPage;
