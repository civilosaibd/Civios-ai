import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight, BadgeCheck, Banknote, BarChart3, CheckCircle2, Gift,
  Link2, MousePointerClick, ShieldCheck, Sparkles, TrendingUp, Users, Wallet,
} from "lucide-react";

const COMMISSION_RATE = 0.10;

const faqs = [
  {
    q: "How does the CivilOS AI Affiliate Program work?",
    a: "Create or sign in to your CivilOS AI account, open your Affiliate Dashboard, and share your unique referral link. When a new user signs up through your link and completes their first eligible payment, the referral is attributed and the commission is recorded after payment verification.",
  },
  {
    q: "How much commission can I earn?",
    a: "The current standard commission rate is 10% of the referred user's first eligible successful payment. The commission is calculated from the verified payment amount, not from clicks or sign-ups alone.",
  },
  {
    q: "Do I earn commission on every renewal?",
    a: "No. The current program rewards one eligible first successful payment per referred user. Later payments or renewals do not create another commission for the same referral.",
  },
  {
    q: "When can I request a withdrawal?",
    a: "You can request a withdrawal when your approved, available balance reaches at least ৳500. Requests are submitted from your Affiliate Dashboard and are subject to review.",
  },
  {
    q: "Which withdrawal methods are supported?",
    a: "The current dashboard supports bKash, Nagad, and bank transfer. Make sure the account details you submit are accurate and belong to you.",
  },
  {
    q: "Can I refer myself or change a referral later?",
    a: "Self-referrals are not eligible. Referral attribution is validated by CivilOS AI and cannot be switched after it has been successfully claimed.",
  },
];

const steps = [
  { icon: Users, number: "01", title: "Join the program", body: "Sign in to CivilOS AI and open your Affiliate Dashboard to access your personal referral link." },
  { icon: Link2, number: "02", title: "Share your link", body: "Share it with your engineering community, students, contractors, clients, or relevant audience." },
  { icon: BadgeCheck, number: "03", title: "A referral becomes a customer", body: "A new user follows your link, creates an account, and completes their first eligible payment." },
  { icon: Wallet, number: "04", title: "Track and withdraw", body: "Your verified commission appears in your dashboard. Request withdrawal when your approved balance reaches ৳500." },
];

const benefits = [
  { icon: TrendingUp, title: "Reward for real conversions", body: "Earn when a referred customer completes an eligible first payment—not simply for clicks." },
  { icon: BarChart3, title: "Transparent tracking", body: "Monitor referrals, conversions, commission status, and available balance in one dashboard." },
  { icon: Wallet, title: "Local withdrawal options", body: "Request approved earnings through bKash, Nagad, or bank transfer." },
  { icon: ShieldCheck, title: "Verified commission records", body: "Payments and commissions are validated by the CivilOS AI referral and billing workflow." },
];

export default function AffiliateProgramPage() {
  const { user } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState("1999");
  const joinHref = user ? "/affiliate" : "/auth?mode=signup";
  const estimatedCommission = useMemo(() => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount * COMMISSION_RATE;
  }, [paymentAmount]);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const money = (amount: number) => `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen flex flex-col overflow-hidden">
      <SEO
        title="Affiliate Program — Earn with CivilOS AI"
        description="Join the CivilOS AI Affiliate Program. Share your referral link, help more people discover civil engineering tools, and earn 10% on an eligible first successful payment."
        path="/affiliate-program"
        jsonLd={faqJsonLd}
      />
      <Navbar />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden border-b bg-slate-950 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="absolute -bottom-40 left-[-5rem] h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:42px_42px]" />
          </div>
          <div className="container relative grid min-h-[540px] items-center gap-12 py-16 md:grid-cols-[1.1fr_.9fr] md:py-24">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" /> CIVILOS AI PARTNER PROGRAM
              </div>
              <h1 className="font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Share smarter engineering.
                <span className="mt-2 block bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Earn with every first conversion.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Help engineers, students, contractors, and construction teams discover CivilOS AI—and earn a reward when your referral becomes a paying customer.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="h-12 gap-2 bg-cyan-400 px-6 font-semibold text-slate-950 hover:bg-cyan-300" asChild>
                  <Link to={joinHref}>Join the Affiliate Program <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 border-white/25 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white" asChild>
                  <a href="#how-it-works">How it works</a>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Free to join</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Personal referral link</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Track from your dashboard</span>
              </div>
            </div>

            <div className="mx-auto w-full max-w-md">
              <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-8">
                <p className="text-sm font-medium text-slate-300">CURRENT STANDARD COMMISSION</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-7xl font-bold tracking-tight text-white">10%</span>
                  <span className="pb-2 text-sm text-cyan-200">per eligible first payment</span>
                </div>
                <div className="my-6 h-px bg-white/15" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-300">Verified first payment</span><span className="font-semibold text-white">৳10,000</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-300">Your commission (illustration)</span><span className="text-xl font-bold text-cyan-300">৳1,000</span></div>
                </div>
                <p className="mt-6 text-xs leading-5 text-slate-400">Illustrative example only. Actual commission is calculated from the eligible payment amount after successful payment verification. One commission per referred customer.</p>
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Clear rules. Verified payments. Tracked rewards.</div>
            </div>
          </div>
        </section>

        <section className="container py-16 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Why partner with us</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">A practical program built around real value</h2>
            <p className="mt-4 text-muted-foreground">Recommend tools that support real civil engineering and construction workflows. Your dashboard keeps the referral journey visible.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="border-border/70 bg-card/90 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y bg-muted/30 py-16 md:py-20">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Simple process</p>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">How the affiliate program works</h2>
              <p className="mt-4 text-muted-foreground">Four straightforward steps from joining to tracking your rewards.</p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ icon: Icon, number, title, body }, index) => (
                <div key={number} className="relative rounded-2xl border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold tracking-widest text-primary">{number}</span>
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-7 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                  {index < steps.length - 1 && <div aria-hidden="true" className="absolute -right-3 top-9 z-10 hidden h-px w-6 bg-primary/30 lg:block" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container grid gap-12 py-16 md:grid-cols-2 md:items-center md:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Earnings calculator</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">See how the 10% example works</h2>
            <p className="mt-4 leading-7 text-muted-foreground">Enter an example first-payment amount to estimate the commission. This is a calculator for illustration, not a promise of earnings.</p>
            <div className="mt-7 max-w-sm space-y-2">
              <label htmlFor="affiliate-payment-amount" className="text-sm font-medium">Example eligible payment amount (BDT)</label>
              <Input id="affiliate-payment-amount" type="number" min="0" step="1" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="h-12 text-base" />
              <p className="text-xs text-muted-foreground">Use any amount to preview the standard commission calculation.</p>
            </div>
          </div>
          <Card className="overflow-hidden border-primary/20 shadow-xl">
            <CardContent className="p-7 sm:p-9">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Gift className="h-4 w-4 text-primary" /> Estimated commission</div>
              <p className="mt-4 text-5xl font-bold tracking-tight text-primary">{money(estimatedCommission)}</p>
              <div className="mt-6 space-y-3 border-t pt-5 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Example payment</span><strong>{money(Math.max(0, Number(paymentAmount) || 0))}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Commission rate</span><strong>10%</strong></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Eligible payment count</span><strong>First payment only</strong></div>
              </div>
              <p className="mt-5 text-xs leading-5 text-muted-foreground">Final commission depends on referral eligibility, successful payment verification, and the program rules in effect at the time.</p>
            </CardContent>
          </Card>
        </section>

        <section className="border-y bg-muted/30 py-16 md:py-20">
          <div className="container grid gap-10 md:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Who can join</p>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight">Built for people connected to construction</h2>
              <p className="mt-4 leading-7 text-muted-foreground">If your audience can benefit from practical engineering and construction tools, you can introduce them to CivilOS AI.</p>
              <Button className="mt-6 gap-2" asChild><Link to={joinHref}>Get started <ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Civil engineering students", "Civil engineers & consultants", "Architects & designers", "Contractors & builders", "Construction educators", "Engineering content creators"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm font-medium"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />{item}</div>
              ))}
            </div>
          </div>
        </section>

        <section className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Program details</p>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
            </div>
            <div className="mt-9 divide-y rounded-2xl border bg-card px-5">
              {faqs.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="text-xl text-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="container pb-16 md:pb-20">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-12 text-center text-white sm:px-12 md:py-16">
            <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="relative mx-auto max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Start sharing today</p>
              <h2 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">Grow your network. Support better engineering.</h2>
              <p className="mt-4 leading-7 text-slate-300">Join CivilOS AI, get your referral link, and follow your performance from one place.</p>
              <Button size="lg" className="mt-7 h-12 gap-2 bg-cyan-400 px-7 font-semibold text-slate-950 hover:bg-cyan-300" asChild>
                <Link to={joinHref}>Join the Affiliate Program <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <p className="mt-4 text-xs text-slate-400">Minimum withdrawal request: ৳500 · Terms and eligibility apply</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
