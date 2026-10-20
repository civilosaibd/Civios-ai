import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const tiers = [
  {
    name: "Free", price: "৳0", cta: "Get Started Free", to: "/billing",
    highlight: false,
    features: ["3 projects", "Basic BOQ Generator", "50 AI credits / month", "Community support"],
    disabled: ["AI Drawing & AI Writer", "Analytics & finance modules"],
  },
  {
    name: "Starter", price: "৳499", cta: "Start Starter", to: "/billing",
    highlight: false,
    features: ["15 projects", "BOQ + Rate Analysis", "1,000 AI credits / month", "PDF & Excel export", "Email support"],
    disabled: [],
  },
  {
    name: "Professional", price: "৳1,999", cta: "Go Professional", to: "/billing",
    highlight: true,
    features: ["Unlimited projects", "All AI modules incl. AI Drawing", "10,000 AI credits / month", "Tender, analytics & finance", "BNBC 2022 compliance", "Team collaboration"],
    disabled: [],
  },
  {
    name: "Business", price: "৳4,999", cta: "Contact Sales", to: "/contact",
    highlight: false,
    features: ["Everything in Professional", "Unlimited team seats", "Company management & roles", "Advanced analytics", "Priority AI processing", "Dedicated manager"],
    disabled: [],
  },
];

export default function PricingSection() {
  // Yearly is the default billing period. Numeric prices intentionally remain unchanged per product requirement.
  const [billingPeriod, setBillingPeriod] = useState<"yearly" | "monthly">("yearly");

  return (
    <section id="pricing" className="py-16 md:py-24 border-t">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 text-accent px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3 w-3" /> Simple, transparent pricing
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-bold">Choose your plan</h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Start free. Upgrade any time as your team grows.
          </p>
          <div className="inline-flex items-center rounded-full border p-1 gap-1" role="group" aria-label="Billing period">
            <Button type="button" size="sm" variant={billingPeriod === "monthly" ? "default" : "ghost"} onClick={() => setBillingPeriod("monthly")}>
              Monthly
            </Button>
            <Button type="button" size="sm" variant={billingPeriod === "yearly" ? "default" : "ghost"} onClick={() => setBillingPeriod("yearly")}>
              Yearly
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {billingPeriod === "yearly" ? "Yearly billing selected. Listed prices remain unchanged as requested." : "Monthly billing selected."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((t) => (
            <div key={t.name}
              className={`relative rounded-2xl border bg-card p-6 flex flex-col ${
                t.highlight ? "border-accent shadow-lg shadow-accent/10 ring-1 ring-accent/40" : ""
              }`}>
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent text-accent-foreground px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <div className="space-y-1">
                <p className="font-heading text-lg font-bold">{t.name}</p>
                <p className="flex items-baseline gap-1">
                  <span className="font-heading text-3xl font-bold">{t.price}</span>
                  <span className="text-xs text-muted-foreground">/{billingPeriod === "yearly" ? "year" : "month"}</span>
                </p>
              </div>
              <ul className="mt-5 space-y-2 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent mt-0.5 shrink-0" /> <span>{f}</span>
                  </li>
                ))}
                {t.disabled.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground line-through">
                    <Check className="h-4 w-4 opacity-30 mt-0.5 shrink-0" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-6 w-full" variant={t.highlight ? "default" : "outline"}>
                <Link to={t.to}>{t.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Prices in BDT (৳). VAT extra where applicable. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
