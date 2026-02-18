// Mercury — Stripe Webhook Handler (Supabase Edge Function)
// Receives Stripe events and updates user tier in Supabase Auth.
//
// Required secrets (set via Supabase Dashboard > Edge Functions > Secrets):
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_URL            (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log(`[Mercury Webhook] Received event: ${event.type}`);

  // ── checkout.session.completed — upgrade to pro ──
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const customerId = session.customer as string;

    if (!userId) {
      console.error("No client_reference_id on checkout session");
      return new Response("Missing user ID", { status: 400 });
    }

    console.log(`[Mercury Webhook] Upgrading user ${userId} to pro`);

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        tier: "pro",
        stripe_customer_id: customerId,
      },
    });

    if (error) {
      console.error("Failed to update user tier:", error);
      return new Response("Failed to update user", { status: 500 });
    }

    console.log(`[Mercury Webhook] User ${userId} upgraded to pro`);
  }

  // ── customer.subscription.deleted — revert to free ──
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    console.log(`[Mercury Webhook] Subscription cancelled for customer ${customerId}`);

    // Look up user by stripe_customer_id in user_metadata
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error("Failed to list users:", listError);
      return new Response("Failed to list users", { status: 500 });
    }

    const user = users.users.find(
      (u) => u.user_metadata?.stripe_customer_id === customerId
    );

    if (!user) {
      console.error(`No user found with stripe_customer_id: ${customerId}`);
      return new Response("User not found", { status: 404 });
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        tier: "free",
      },
    });

    if (error) {
      console.error("Failed to revert user tier:", error);
      return new Response("Failed to update user", { status: 500 });
    }

    console.log(`[Mercury Webhook] User ${user.id} reverted to free`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
