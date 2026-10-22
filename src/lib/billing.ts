import { supabase } from "@/integrations/supabase/client";
import { planPrice, type Plan } from "@/lib/subscription";

/**
 * Payment abstraction layer.
 * Today only the `manual` provider (bKash / Nagad / bank transfer with admin
 * verification) is configured. A card gateway can be added by implementing the
 * PaymentProvider interface below and registering it in `providers`.
 */
export interface CheckoutInput {
  userId: string;
  plan: Plan;
  cycle: "yearly";
  method: string;
  transactionId: string;
  senderNumber: string;
}

export interface PaymentProvider {
  id: string;
  label: string;
  /** creates a payment record and returns its id; never grants access itself */
  checkout: (input: CheckoutInput) => Promise<{ paymentId: string; status: string }>;
}

export const MANUAL_PAYMENT_NUMBER = "+8801832313998";

export const VAT_RATE = 0; // set > 0 when VAT registration is active

/** Yearly is the only billing period. The amount is the plan's configured price, unchanged. */
export const priceFor = (plan: Plan, _cycle: "yearly" = "yearly") => planPrice(plan);

export const totalFor = (plan: Plan, cycle: "yearly" = "yearly") => {
  const base = priceFor(plan, cycle);
  const vat = Math.round(base * VAT_RATE);
  return { base, vat, total: base + vat };
};

const manualProvider: PaymentProvider = {
  id: "manual",
  label: "bKash / Nagad / Bank transfer",
  async checkout({ userId, plan, cycle, method, transactionId, senderNumber }) {
    const { total } = totalFor(plan, cycle);
    const { data, error } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        amount: total,
        currency: plan.currency || "BDT",
        billing_cycle: cycle,
        payment_provider: "manual",
        payment_method: method,
        transaction_id: transactionId.trim(),
        sender_number: senderNumber.trim(),
        status: "pending",
      })
      .select("id, status")
      .single();
    if (error) throw error;
    return { paymentId: data.id, status: data.status };
  },
};

export const providers: Record<string, PaymentProvider> = {
  manual: manualProvider,
};

export const paymentService = {
  checkout: (input: CheckoutInput, providerId = "manual") => {
    const provider = providers[providerId];
    if (!provider) throw new Error("Payment provider not configured");
    return provider.checkout(input);
  },
};

export const subscriptionService = {
  /** server-side (RPC): a user can only cancel their own active subscription */
  async cancel(_subscriptionId?: string) {
    const { error } = await supabase.rpc("cancel_my_subscription");
    if (error) throw error;
  },
};

/**
 * Admin-only. Verification is ONE atomic server-side function (RLS + has_role
 * checked inside Postgres); the browser never writes subscriptions directly.
 */
export const billingService = {
  async approvePayment(payment: { id: string }) {
    const { error } = await supabase.rpc("approve_payment", { _payment_id: payment.id });
    if (error) throw error;
  },

  async rejectPayment(paymentId: string, note: string) {
    const { error } = await supabase.rpc("reject_payment", { _payment_id: paymentId, _note: note });
    if (error) throw error;
  },
};
