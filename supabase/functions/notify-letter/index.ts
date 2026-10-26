import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSupportedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && (!url.port || url.port === "443")
      && (
        host === "fcm.googleapis.com"
        || host === "updates.push.services.mozilla.com"
        || host.endsWith(".push.apple.com")
        || host.endsWith(".notify.windows.com")
      );
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error("Push notification secrets are not fully configured.");
    return respond({ error: "Push notifications are not configured." }, 500);
  }
  if (!authorization) return respond({ error: "Authentication is required." }, 401);

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return respond({ error: "Authentication is required." }, 401);

    const { letterId } = await request.json();
    if (typeof letterId !== "string" || !/^[0-9a-f-]{36}$/i.test(letterId)) {
      return respond({ error: "A valid letter ID is required." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: letter, error: letterError } = await admin
      .from("letters")
      .select("id, couple_id, author_id")
      .eq("id", letterId)
      .maybeSingle();
    if (letterError) throw letterError;
    if (!letter || letter.author_id !== user.id) return respond({ error: "Letter not found." }, 404);

    const { data: partner, error: partnerError } = await admin
      .from("couple_members")
      .select("user_id")
      .eq("couple_id", letter.couple_id)
      .neq("user_id", user.id)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner) return respond({ sent: 0, reason: "not_enabled" });

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("endpoint, subscription")
      .eq("user_id", partner.user_id);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) return respond({ sent: 0, reason: "not_enabled" });

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({
      title: "A new letter for you 💌",
      body: "Your person left you a little note.",
      url: "/",
    });
    let sent = 0;
    let failed = false;

    await Promise.all(subscriptions.map(async ({ endpoint, subscription }) => {
      if (!isSupportedPushEndpoint(endpoint)) {
        failed = true;
        return;
      }

      try {
        await webpush.sendNotification(subscription, payload, { TTL: 86400 });
        sent += 1;
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? error.statusCode
          : undefined;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await admin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint);
          if (deleteError) console.error("Could not remove an expired push subscription.", deleteError);
          return;
        }
        failed = true;
        console.error("Push notification delivery failed with status code.", statusCode);
      }
    }));

    return respond({ sent, failed });
  } catch (error) {
    console.error("Could not send letter notification.", error);
    return respond({ error: "Could not send the notification." }, 500);
  }
});
