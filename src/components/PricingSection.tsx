import { Check, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { formatBDT, formatLimit, planPrice, usePublicPlans, type Plan } from "@/lib/subscription";

const tiers = [
  { code: "free", cta: "Get Started Free", to: "/billing", highlight: false },
  { code: "starter", cta: "Start Starter", to: "/billing", highlight: false },
  { code: "professional", cta: "Go Professional", to: "/billing", highlight: true },
  { code: "business", cta: "Contact Sales", to: "/contact", highlight: false },
] as const;

// Display values come from the same active plans/limits rows used by the app.
// Do not hardcode plan prices or multiply yearly prices.
const limitFeatures: { key: string; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "ai_credits", label: "AI credits / month" },
  { key: "boq", label: "BOQ generations / month" },
  { key: "bbs", label: "BBS generations / month" },
  { key: "drawings", label: "Drawing analyses / month" },
  { key: "team_members", label: "Team members" },
  { key: "storage_mb", label: "Storage (MB)" },
];

const capabilityFeatures: { key: string; label: string }[] = [
  { key: "ai_writer", label: "AI Writer" },
  { key: "ai_drawing", label: "AI Drawing" },
  { key: "ai_insights", label: "AI Insights" },
  { key: "analytics", label: "Analytics" },
  { key: "tender", label: "Tender tools" },
  { key: "finance", label: "Finance tools" },
  { key: "procurement", label: "Procurement tools" },
  { key: "team", label: "Team collaboration" },
  { key: "export_excel", label: "Excel export" },
  { key: "priority_support", label: "Priority support" },
];

function planFeatures(plan: Plan) {
  const limits = plan.limits || {};
  const rows: { label: string; included: boolean; value?: string }[] = [];

  for (const feature of limitFeatures) {
    const value = limits[feature.key];
    if (typeof value !== "number") continue;
    rows.push({
      label: feature.label,
      included: value !== 0,
      value: formatLimit(value),
    });
  }

  for (const feature of capabilityFeatures) {
    const value = limits[feature.key];
    if (typeof value !== "boolean") continue;
    rows.push({ label: feature.label, included: value });
  }

  return rows;
}

export default function PricingSection() {
  const { t: tr } = useI18n();
  const { plans, loading, failed } = usePublicPlans();
  const planByCode = (code: string) => plans.find((plan) => plan.code === code);
  const priceOf = (plan: Plan) => planPrice(plan) > 0 ? formatBDT(planPrice(plan)) : "৳0";

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
          <p className="text-xs text-muted-foreground">{tr("billing.yearlyPlan")} — {tr("billing.yearlyNote")}</p>
        </div>

        {failed && (
          <p role="status" className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center text-sm text-muted-foreground">
            {tr("billing.pricesUnavailable")}. Plan details could not be loaded; please try again later.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tier) => {
            const plan = planByCode(tier.code);
            const rows = plan ? planFeatures(plan) : [];
            return (
              <div key={tier.code}
                className={`relative rounded-2xl border bg-card p-6 flex flex-col ${
                  tier.highlight ? "border-accent shadow-lg shadow-accent/10 ring-1 ring-accent/40" : ""
                }`}>
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent text-accent-foreground px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <div className="space-y-1">
                  <p className="font-heading text-lg font-bold">{plan?.name || (loading ? "Loading…" : tier.code)}</p>
                  <p className="flex items-baseline gap-1">
                    <span className="font-heading text-3xl font-bold">
                      {plan ? priceOf(plan) : (loading ? "…" : "—")}
                    </span>
                    <span className="text-xs text-muted-foreground">{tr("billing.year")}</span>
                  </p>
                  {plan?.tagline && <p className="text-xs text-muted-foreground">{plan.tagline}</p>}
                </div>

                <ul className="mt-5 space-y-2 flex-1">
                  {plan?.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check aria-hidden="true" className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {rows.map((row) => (
                    <li key={row.label} className={`flex items-start gap-2 text-sm ${row.included ? "" : "text-muted-foreground"}`}>
                      {row.included
                        ? <Check aria-hidden="true" className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                        : <Lock aria-hidden="true" className="h-4 w-4 mt-0.5 shrink-0" />}
                      <span>{row.label}{row.value ? `: ${row.value}` : ""}</span>
                    </li>
                  ))}
                  {!plan && !loading && (
                    <li className="text-sm text-muted-foreground">This plan is currently unavailable.</li>
                  )}
                </ul>

                <Button asChild className="mt-6 w-full" variant={tier.highlight ? "default" : "outline"} disabled={!plan && loading}>
                  <Link to={tier.to}>{tier.cta}</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Prices in BDT (৳), billed yearly. VAT extra where applicable. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
