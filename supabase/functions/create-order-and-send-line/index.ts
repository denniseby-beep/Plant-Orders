import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    const lineUserId = Deno.env.get("LINE_USER_ID");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase server secrets");
    }

    if (!lineToken || !lineUserId) {
      throw new Error("Missing LINE secrets");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const orderData = await req.json();

    const {
      order_date,
      customer,
      mix_type,
      quantity_tonne,
      load_time,
      address,
      job_number,
      po_number,
      foreman,
      site_contact_name,
      site_contact_phone,
      notes,
      weather_call,
      weather_call_time,
    } = orderData;

    if (!order_date || !customer || !mix_type || !quantity_tonne || !load_time) {
      return new Response(
        JSON.stringify({ error: "Missing required order fields" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: insertedOrder, error: insertError } = await supabase
      .from("orders")
      .insert([orderData])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    const message = `🚛 NEW ORDER

Order Date: ${order_date}
Load Time: ${load_time}

Customer: ${customer}
Mix: ${mix_type}
Quantity: ${quantity_tonne} tonnes

Job #: ${job_number || "-"}
PO #: ${po_number || "-"}
Foreman: ${foreman || "-"}

Address: ${address || "-"}
Site Contact: ${site_contact_name || "-"}
Site Phone: ${site_contact_phone || "-"}

Weather Call: ${weather_call ? "Yes" : "No"}
Weather Call Time: ${weather_call_time || "-"}

Notes: ${notes || "-"}`;

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: message }],
      }),
    });

    const lineText = await lineRes.text();

    if (!lineRes.ok) {
      return new Response(
        JSON.stringify({
          error: "LINE API failed",
          status: lineRes.status,
          details: lineText,
          order: insertedOrder,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        order: insertedOrder,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});