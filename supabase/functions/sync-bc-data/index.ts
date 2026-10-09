import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper to handle BC null/blank dates (e.g. "0001-01-01")
const parseBCDate = (dateStr: string | null) => {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return null;
  return dateStr;
};

serve(async (_req) => {
  try {
    const BC_URL = Deno.env.get("BC_API_URL")!;
    const BC_TOKEN = Deno.env.get("BC_BEARER_TOKEN")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Fetch live payload from Business Central
    const bcRes = await fetch(BC_URL, {
      headers: {
        Authorization: `Bearer ${BC_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!bcRes.ok) {
      throw new Error(`BC Fetch Error: ${bcRes.statusText}`);
    }

    const bcJson = await bcRes.json();
    const bcItems = bcJson.value || [bcJson];

    // 2. Map Business Central fields to database columns
    const mappedRows = bcItems.map((item: any) => ({
      bc_asset_id: item.No,
      description: item.Description,
      asset_type: item.Asset_Type,
      fa_class_code: item.FA_Class_Code,
      fa_subclass_code: item.FA_Subclass_Code,
      location_code: item.FA_Location_Code,
      is_budgeted: item.Budgeted_Asset ?? false,
      serial_no: item.Serial_No,
      responsible_employee: item.Responsible_Employee,
      is_inactive: item.Inactive ?? false,
      is_blocked: item.Blocked ?? false,
      is_acquired: item.Acquired ?? false,
      last_modified_date: parseBCDate(item.Last_Date_Modified),
      depreciation_book_code: item.DepreciationBookCode,
      posting_group: item.FAPostingGroup,
      depreciation_method: item.DepreciationMethod,
      depreciation_start_date: parseBCDate(item.DepreciationStartingDate),
      depreciation_years: item.NumberOfDepreciationYears,
      depreciation_end_date: parseBCDate(item.DepreciationEndingDate),
      book_value: item.BookValue ?? 0,
      vendor_no: item.Vendor_No,
      maintenance_vendor_no: item.Maintenance_Vendor_No,
      under_maintenance: item.Under_Maintenance ?? false,
      next_service_date: parseBCDate(item.Next_Service_Date),
      warranty_date: parseBCDate(item.Warranty_Date),
      is_insured: item.Insured ?? false,
      raw_payload: item,
      updated_at: new Date().toISOString(),
    }));

    // 3. Upsert into Supabase database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("assets_bc")
      .upsert(mappedRows, { onConflict: "bc_asset_id" });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, synced_count: mappedRows.length }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});