import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const body = await req.json();

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
    } = body;

    if (!order_date || !customer || !mix_type || !quantity_tonne || !load_time) {
      return new Response(
        JSON.stringify({ error: "Missing required order fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
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

    const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    const lineUserId = Deno.env.get("LINE_USER_ID");

    if (!lineToken || !lineUserId) {
      return new Response(
        JSON.stringify({ error: "Missing LINE secrets" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    const lineText = await lineRes.text();

    if (!lineRes.ok) {
      return new Response(
        JSON.stringify({
          error: "LINE API failed",
          status: lineRes.status,
          details: lineText,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, line: lineText || "Message sent" }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});