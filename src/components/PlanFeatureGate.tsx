import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "@/lib/subscription";

type PlanFeatureGateProps = {
  feature: string;
  children: ReactNode;
};

/**
 * Route-level UX gate for plan capabilities.
 * Server-side authorization and RLS remain the security boundary for data/API access.
 */
export default function PlanFeatureGate({ feature, children }: PlanFeatureGateProps) {
  const { loading, plan, hasFeature } = useSubscription();

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Checking your plan access…</div>;
  }

  if (hasFeature(feature)) return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center p-4">
      <Card className="w-full border-border/70">
        <CardHeader className="items-center text-center">
          <div className="mb-2 rounded-full bg-muted p-4"><LockKeyhole className="h-7 w-7" /></div>
          <CardTitle>Upgrade required</CardTitle>
          <CardDescription>
            {plan?.name ? `The ${plan.name} plan does not include this feature.` : "Your current plan does not include this feature."}
            {" "}Choose a plan that includes this capability to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild><Link to="/billing"><Sparkles className="mr-2 h-4 w-4" />View plans</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
