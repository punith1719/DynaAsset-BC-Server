import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workOrderId, title, assetId, customerNo } = await req.json();

    if (!workOrderId || !title || !assetId) {
      throw new Error("Missing required fields: workOrderId, title, or assetId");
    }

    // 1. Call BC Sync Service
    const bcSyncUrl = Deno.env.get("BC_SYNC_URL");
    if (!bcSyncUrl) {
      throw new Error("BC_SYNC_URL environment variable is not configured");
    }

    const syncResponse = await fetch(`${bcSyncUrl}/SalesOrdercard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workOrderId, title, assetId, customerNo }),
    });

    const syncResult = await syncResponse.json();

    if (!syncResponse.ok || !syncResult.success) {
      throw new Error(syncResult.error || "Business Central synchronization failed");
    }

    const bcWorkOrderId = syncResult.bcWorkOrderId; // e.g., "1001"

    // 2. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 3. Insert or Update Approved Record in Supabase
    const { data, error } = await supabaseAdmin
      .from("work_orders")
      .insert([
        {
          work_order_no: workOrderId,
          title: title,
          asset_id: assetId,
          bc_work_order_id: bcWorkOrderId, // Store BC "No" ("1001")
          approval_stage: "approved",
          status: "Approved",
        },
      ])
      .select();

    if (error) {
      throw new Error(`Failed to save record in Supabase: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sales Order created in Business Central and saved to Supabase",
        bcWorkOrderId: bcWorkOrderId,
        record: data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});