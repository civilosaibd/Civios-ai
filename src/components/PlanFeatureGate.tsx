import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
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
  const { loading, error, plan, hasFeature, reload } = useSubscription();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Checking your plan access…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center p-4">
        <Card className="w-full border-destructive/30">
          <CardHeader className="items-center text-center">
            <div className="mb-2 rounded-full bg-destructive/10 p-4 text-destructive"><AlertCircle className="h-7 w-7" /></div>
            <CardTitle>Unable to verify plan access</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
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
