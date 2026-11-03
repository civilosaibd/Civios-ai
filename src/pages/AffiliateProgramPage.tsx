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
  ArrowDown, ArrowRight, BadgeCheck, BarChart3, Check, CheckCircle2,
  ChevronDown, Gift, Link2, MousePointerClick, ShieldCheck, Sparkles,
  TrendingUp, Users, Wallet, Zap,
} from "lucide-react";

const FIRST_PAYMENT_COMMISSION_RATE = 0.30;
const SUBSEQUENT_COMMISSION_RATE = 0.10;

const faqs = [
  { q: "How does the CivilOS AI Affiliate Program work?", a: "Create or sign in to your CivilOS AI account, open your Affiliate Dashboard, and share your unique referral link. When a new user signs up through your link and completes an eligible payment, the referral is attributed and the commission is recorded after payment verification." },
  { q: "How much commission can I earn?", a: "You earn 30% of the referred user's first eligible successful payment, then 10% on each subsequent eligible verified payment. Commission is calculated from the verified payment amount, not from clicks or sign-ups alone." },
  { q: "Do I earn commission on every renewal?", a: "Yes. The first eligible successful payment earns 30%, and each subsequent eligible verified payment earns 10%, subject to program eligibility and payment verification." },
  { q: "When can I request a withdrawal?", a: "You can request a withdrawal when your approved, available balance reaches at least ৳500. Requests are submitted from your Affiliate Dashboard and are subject to review." },
  { q: "Which withdrawal methods are supported?", a: "The current dashboard supports bKash, Nagad, and bank transfer. Make sure the account details you submit are accurate and belong to you." },
  { q: "Can I refer myself or change a referral later?", a: "Self-referrals are not eligible. Referral attribution is validated by CivilOS AI and cannot be switched after it has been successfully claimed." },
];

const steps = [
  { icon: Users, number: "01", title: "Join for free", body: "Sign in to CivilOS AI and open your Affiliate Dashboard to get your personal referral link." },
  { icon: Link2, number: "02", title: "Share your link", body: "Introduce CivilOS AI to your engineering community, students, clients, or professional network." },
  { icon: BadgeCheck, number: "03", title: "Get rewarded", body: "When a referred customer completes an eligible verified payment, your commission is recorded." },
  { icon: Wallet, number: "04", title: "Track & withdraw", body: "Follow every referral and commission in your dashboard. Request payout from ৳500." },
];

const benefits = [
  { icon: TrendingUp, title: "Recurring earning potential", body: "Earn 30% on the first eligible payment and 10% on every subsequent eligible verified payment." },
  { icon: BarChart3, title: "A clear performance view", body: "See referrals, conversions, commission status, and available balance in one dashboard." },
  { icon: Wallet, title: "Bangladesh-friendly payouts", body: "Request approved earnings through bKash, Nagad, or bank transfer." },
  { icon: ShieldCheck, title: "Verified & transparent", body: "Commissions are calculated from verified payments and tracked in your account." },
];

const audiences = [
  "Civil engineering students", "Civil engineers & consultants", "Architects & designers",
  "Contractors & builders", "Construction educators", "Engineering content creators",
];

export default function AffiliateProgramPage() {
  const { user } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState("10000");
  const joinHref = user ? "/affiliate" : "/auth?mode=signup&redirect=%2Faffiliate";
  const amount = Number(paymentAmount);
  const validAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const firstCommission = useMemo(() => validAmount * FIRST_PAYMENT_COMMISSION_RATE, [validAmount]);
  const repeatCommission = useMemo(() => validAmount * SUBSEQUENT_COMMISSION_RATE, [validAmount]);
  const money = (value: number) => `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-background">
      <SEO
        title="Affiliate Program — Earn with CivilOS AI"
        description="Join the CivilOS AI Affiliate Program. Earn 30% on the first eligible successful payment and 10% on subsequent eligible verified payments."
        path="/affiliate-program"
        jsonLd={faqJsonLd}
      />
      <Navbar />

      <main className="flex-1">
        {/* Premium hero */}
        <section className="relative isolate overflow-hidden bg-[#071426] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-blue-600/25 blur-[110px]" />
            <div className="absolute -right-32 top-16 h-[30rem] w-[30rem] rounded-full bg-cyan-400/20 blur-[110px]" />
            <div className="absolute bottom-[-16rem] left-[35%] h-[30rem] w-[30rem] rounded-full bg-indigo-500/20 blur-[110px]" />
            <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#071426] to-transparent" />
          </div>

          <div className="container relative grid min-h-[680px] items-center gap-14 py-20 lg:grid-cols-[1.08fr_.92fr] lg:py-24">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/[0.09] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.19em] text-cyan-200 shadow-lg shadow-cyan-950/20">
                <Sparkles className="h-4 w-4" /> CivilOS AI · Partner program
                <span className="ml-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] tracking-wider text-emerald-300">OPEN TO JOIN</span>
              </div>
              <h1 className="mt-7 font-heading text-5xl font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[4.35rem]">
                Your network.
                <span className="block bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text pb-2 text-transparent">Your influence.</span>
                <span className="block">Your reward.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
                Help the engineering community discover a smarter way to work. Share CivilOS AI with people you trust and earn from the customers you refer.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="h-14 gap-2 rounded-xl bg-cyan-400 px-7 text-base font-bold text-slate-950 shadow-xl shadow-cyan-950/30 hover:bg-cyan-300" asChild>
                  <Link to={joinHref}>Become an affiliate <ArrowRight className="h-5 w-5" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="h-14 gap-2 rounded-xl border-white/20 bg-white/[0.06] px-7 text-base text-white hover:bg-white/10 hover:text-white" asChild>
                  <a href="#how-it-works">Explore how it works <ArrowDown className="h-4 w-4" /></a>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
                {["Free to join", "No audience-size requirement", "Live dashboard tracking"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-300" />{item}</span>
                ))}
              </div>
            </div>

            {/* Earnings preview card */}
            <div className="relative mx-auto w-full max-w-[470px] lg:mr-0">
              <div aria-hidden="true" className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-cyan-400/20 via-blue-500/10 to-violet-500/20 blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.075] p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commission overview</p>
                    <p className="mt-1 text-lg font-semibold text-white">Earn as referrals grow</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Zap className="h-5 w-5" /></div>
                </div>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-cyan-300/25 bg-gradient-to-br from-cyan-300/15 to-blue-500/10 p-5">
                    <p className="text-xs font-medium text-cyan-100/80">First eligible payment</p>
                    <p className="mt-2 text-5xl font-bold tracking-tight text-white">30<span className="text-3xl">%</span></p>
                    <p className="mt-2 text-xs text-cyan-100/70">One-time first tier</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                    <p className="text-xs font-medium text-slate-300">Every later payment</p>
                    <p className="mt-2 text-5xl font-bold tracking-tight text-white">10<span className="text-3xl">%</span></p>
                    <p className="mt-2 text-xs text-slate-400">Subsequent tier</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-[#06101f]/70 p-5">
                  <div className="flex items-center justify-between text-xs text-slate-400"><span>Example · verified payment ৳10,000</span><span className="rounded-full bg-emerald-400/10 px-2 py-1 font-semibold text-emerald-300">Illustrative</span></div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div><p className="text-sm text-slate-300">Your first commission</p><p className="mt-1 text-4xl font-bold tracking-tight text-cyan-300">৳3,000</p></div>
                    <div className="text-right"><p className="text-xs text-slate-400">Later payment</p><p className="mt-1 text-2xl font-bold text-white">৳1,000</p></div>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[30%] rounded-full bg-gradient-to-r from-cyan-300 to-blue-400" /></div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>30% first payment</span><span>10% subsequent</span></div>
                </div>
                <div className="mt-5 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300" /> Commission is recorded after eligible payment verification.</div>
              </div>
              <div className="relative mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[#0c2036]/90 px-4 py-2 text-xs text-slate-300 shadow-xl">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" /> Built for the engineering community
              </div>
            </div>
          </div>
        </section>

        {/* Trust/value strip */}
        <section className="relative z-10 -mt-1 border-b bg-card">
          <div className="container grid divide-y py-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { icon: Gift, title: "Free to join", sub: "No upfront membership fee" },
              { icon: BarChart3, title: "Track every step", sub: "Referral and commission visibility" },
              { icon: Wallet, title: "Withdraw from ৳500", sub: "Approved balance threshold" },
            ].map(({ icon: Icon, title, sub }) => (
              <div key={title} className="flex items-center gap-4 px-5 py-5 sm:justify-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <div><p className="font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{sub}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="container py-20 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Why partner with CivilOS AI</p>
            <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">A smarter way to grow together.</h2>
            <p className="mt-5 leading-7 text-muted-foreground">Turn trusted recommendations into measurable rewards—with a program designed around genuine customers and verified payments.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, body }, index) => (
              <Card key={title} className="group relative overflow-hidden rounded-2xl border-border/70 bg-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-xl">
                <CardContent className="relative p-6">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-5 w-5" /></div>
                  <span className="absolute right-6 top-7 text-xs font-bold tracking-widest text-muted-foreground/50">0{index + 1}</span>
                  <h3 className="text-base font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Process */}
        <section id="how-it-works" className="scroll-mt-24 border-y bg-muted/30 py-20 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">The process</p>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Four steps. One simple journey.</h2>
              <p className="mt-5 text-muted-foreground">From your first share to your first approved payout, everything stays connected to your dashboard.</p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ icon: Icon, number, title, body }, index) => (
                <div key={number} className="relative rounded-2xl border bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between"><span className="text-sm font-black tracking-[0.2em] text-primary">{number}</span><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div></div>
                  <h3 className="mt-7 text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                  {index < steps.length - 1 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-10 z-10 hidden h-6 w-6 rounded-full bg-background p-1 text-primary lg:block" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Calculator */}
        <section className="container grid gap-12 py-20 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Interactive earnings calculator</p>
            <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Make the numbers real.</h2>
            <p className="mt-5 max-w-lg leading-7 text-muted-foreground">Try an example payment amount and instantly compare your first-payment reward with the commission on later eligible payments.</p>
            <div className="mt-8 max-w-sm space-y-3">
              <label htmlFor="affiliate-payment-amount" className="text-sm font-semibold">Example eligible payment amount (BDT)</label>
              <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">৳</span><Input id="affiliate-payment-amount" type="number" min="0" step="1" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="h-14 rounded-xl pl-9 text-lg font-semibold" /></div>
              <p className="text-xs leading-5 text-muted-foreground">This calculator is illustrative. Actual commission depends on referral eligibility and successful payment verification.</p>
            </div>
          </div>
          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/15 to-cyan-400/10 blur-2xl" />
            <Card className="relative overflow-hidden rounded-3xl border-primary/20 shadow-2xl">
              <div className="bg-gradient-to-br from-primary to-blue-600 p-7 text-primary-foreground sm:p-9">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/80"><MousePointerClick className="h-4 w-4" /> Your estimated first reward</div>
                <p className="mt-4 text-5xl font-black tracking-tight sm:text-6xl">{money(firstCommission)}</p>
                <p className="mt-2 text-sm text-white/75">30% of the first eligible payment</p>
              </div>
              <CardContent className="space-y-5 p-7 sm:p-9">
                <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Example payment</p><p className="mt-1 font-bold">{money(validAmount)}</p></div><div className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary">30% first</div></div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">First eligible payment</p><p className="mt-1 text-xs text-muted-foreground">30% commission</p></div><p className="text-2xl font-extrabold text-primary">{money(firstCommission)}</p></div>
                <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Each subsequent payment</p><p className="mt-1 text-xs text-muted-foreground">10% commission</p></div><p className="text-2xl font-extrabold">{money(repeatCommission)}</p></div>
                <div className="rounded-xl bg-muted/70 p-4 text-xs leading-5 text-muted-foreground">Commissions are calculated from eligible verified payments. This preview is not a guarantee of earnings.</div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Audience */}
        <section className="border-y bg-muted/30 py-20 md:py-24">
          <div className="container grid gap-12 md:grid-cols-[.85fr_1.15fr] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Made for your community</p>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">If you know engineering, you can make an impact.</h2>
              <p className="mt-5 leading-7 text-muted-foreground">You don't need to be a large creator. If people in your network can benefit from better engineering and construction tools, you can introduce them to CivilOS AI.</p>
              <Button className="mt-7 h-12 gap-2 rounded-xl px-6" asChild><Link to={joinHref}>Join the program <ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {audiences.map((item) => <div key={item} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm font-semibold shadow-sm"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><Check className="h-4 w-4" /></span>{item}</div>)}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="container py-20 md:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Need to know</p><h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2><p className="mt-4 text-muted-foreground">Everything you need to understand before sharing your link.</p></div>
            <div className="mt-10 divide-y rounded-2xl border bg-card px-6 shadow-sm">
              {faqs.map((item) => <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">{item.q}<ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" /></summary>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{item.a}</p>
              </details>)}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="container pb-20 md:pb-24">
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#071426] px-6 py-14 text-center text-white shadow-2xl shadow-blue-950/15 sm:px-12 md:py-20">
            <div aria-hidden="true" className="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-cyan-400/20 blur-[90px]" />
            <div aria-hidden="true" className="absolute -bottom-40 -left-20 h-80 w-80 rounded-full bg-blue-600/25 blur-[90px]" />
            <div className="relative mx-auto max-w-2xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Sparkles className="h-6 w-6" /></div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Your next step starts here</p>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Share what moves engineering forward.</h2>
              <p className="mt-5 leading-7 text-slate-300">Join the CivilOS AI Affiliate Program, get your unique referral link, and start building value with your network.</p>
              <Button size="lg" className="mt-8 h-14 gap-2 rounded-xl bg-cyan-400 px-8 text-base font-bold text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-300" asChild><Link to={joinHref}>Become an affiliate <ArrowRight className="h-5 w-5" /></Link></Button>
              <p className="mt-5 text-xs text-slate-400">Free to join · Minimum withdrawal request ৳500 · Program terms apply</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
