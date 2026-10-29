import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { useI18n } from "@/lib/i18n";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Building2,
  ClipboardList,
  Compass,
  DraftingCompass,
  HardHat,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const principles = [
  {
    icon: Building2,
    title: "Built around real projects",
    description: "Keep project information, quantities, estimates and site workflows connected instead of scattered across disconnected tools.",
  },
  {
    icon: ClipboardList,
    title: "Practical engineering workflows",
    description: "Support day-to-day work from early planning and BOQ preparation to coordination, reporting and project review.",
  },
  {
    icon: ShieldCheck,
    title: "Engineer-led decisions",
    description: "Use AI as an assistant—not a substitute for professional judgement, approved drawings, codes or on-site verification.",
  },
];

const capabilities = [
  { icon: DraftingCompass, label: "Planning & design workflows" },
  { icon: Layers3, label: "BOQ, quantities & estimates" },
  { icon: HardHat, label: "Site coordination & reporting" },
  { icon: Sparkles, label: "AI-assisted engineering tasks" },
];

const AboutPage = () => {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="About CivilOS AI"
        description="Discover CivilOS AI, an AI-assisted civil engineering workspace for project planning, quantity surveying, BOQ, estimating and site workflows."
        path="/about"
      />
      <Navbar />
      <main className="flex-1">
        <section className="relative isolate overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-accent/10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="container grid max-w-6xl items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
                <BadgeCheck className="h-4 w-4" />
                About CivilOS AI
              </div>
              <h1 className="max-w-3xl font-heading text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                A more connected workspace for <span className="text-primary">civil engineering.</span>
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {t("about.p1")}
              </p>
              <p className="max-w-2xl leading-7 text-muted-foreground">
                {t("about.p2")}
              </p>
              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/signup">Get started <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/contact">Talk to our team</Link>
                </Button>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div aria-hidden="true" className="absolute -inset-5 rounded-[2rem] bg-primary/10 blur-2xl" />
              <div className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-xl sm:p-7">
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
                      <Compass className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-heading font-semibold">Engineering workspace</p>
                      <p className="text-xs text-muted-foreground">One connected workflow</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Project-first</span>
                </div>
                <div className="grid gap-3 py-5 sm:grid-cols-2">
                  {capabilities.map(({ icon: Icon, label }, index) => (
                    <div key={label} className="rounded-2xl border bg-muted/30 p-4">
                      <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-medium leading-5">{label}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${72 + index * 7}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  AI outputs should be checked against project requirements, local standards and qualified engineering review.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-14 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Our approach</p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Useful tools. Clear workflows. Better coordination.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              CivilOS AI brings common engineering tasks into a workspace designed to help teams organise information and spend less time switching between tools.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {principles.map(({ icon: Icon, title, description }) => (
              <article key={title} className="group rounded-2xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/30">
          <div className="container grid max-w-6xl gap-8 py-12 sm:py-16 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">The mission</p>
              <h2 className="font-heading text-3xl font-bold tracking-tight">Make engineering work more accessible and organised.</h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground sm:text-base">
              <p>We aim to make practical digital tools easier to access for civil engineering students, professionals, contractors and project teams—while keeping engineering responsibility at the centre.</p>
              <p>Every project is different. Use CivilOS AI to support your workflow, then validate quantities, assumptions, drawings and decisions using the applicable standards and approved project documents.</p>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-14 sm:py-20">
          <div className="flex flex-col gap-6 rounded-3xl bg-primary p-7 text-primary-foreground sm:p-10 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary-foreground/80">
                <Blocks className="h-4 w-4" /> Meet CivilOS AI
              </div>
              <h2 className="font-heading text-2xl font-bold sm:text-3xl">Ready to bring your engineering workflow together?</h2>
              <p className="mt-3 leading-7 text-primary-foreground/80">Explore the workspace or contact us with questions, feedback and ideas.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button asChild variant="secondary" size="lg"><Link to="/signup">Create an account</Link></Button>
              <Button asChild variant="outline" size="lg" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to="/contact">Contact us</Link></Button>
            </div>
          </div>
          <div className="mt-8 rounded-2xl border bg-card p-6 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("about.developedBy")}</p>
              <p className="mt-1 font-heading text-lg font-semibold">{t("about.devName")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("about.devRole")}</p>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:mt-0 sm:text-right">
              Built with a focus on practical civil engineering workflows, accessible tools and continuous improvement.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AboutPage;
