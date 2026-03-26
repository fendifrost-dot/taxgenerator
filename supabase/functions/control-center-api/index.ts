import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (authHeader.replace("Bearer ", "") !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const { action, tax_year, status_filter, limit = 20 } = body;
  if (!action) return new Response(JSON.stringify({ error: "action required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  let result: any;

  try {
    if (action === "get_workflow_status") {
      let q = supabase.from("workflow_states").select("*").order("tax_year", { ascending: false }).limit(1);
      if (tax_year) q = q.eq("tax_year", tax_year);
      const { data, error } = await q.single(); if (error) throw error;
      result = { workflow_status: data };
    } else if (action === "get_year_config") {
      let q = supabase.from("tax_year_configs").select("*, state_configs(*)").order("year", { ascending: false }).limit(1);
      if (tax_year) q = q.eq("year", tax_year);
      const { data, error } = await q.single(); if (error) throw error;
      result = { year_config: data };
    } else if (action === "get_documents") {
      let q = supabase.from("documents").select("id,type,file_name,uploaded_at,tax_year,verification_status,verification_errors").order("uploaded_at", { ascending: false }).limit(limit);
      if (tax_year) q = q.eq("tax_year", tax_year);
      if (status_filter) q = q.eq("verification_status", status_filter);
      const { data, error } = await q; if (error) throw error;
      result = { documents: data, total: data?.length ?? 0 };
    } else if (action === "get_transactions") {
      let q = supabase.from("transactions").select("id,date,description,amount,source,state,category_id,evidence_status,tax_year").order("date", { ascending: false }).limit(limit);
      if (tax_year) q = q.eq("tax_year", tax_year);
      if (status_filter) q = q.eq("state", status_filter);
      const { data, error } = await q; if (error) throw error;
      const counts: Record<string,number> = {};
      for (const t of data ?? []) counts[t.state] = (counts[t.state] ?? 0) + 1;
      result = { transactions: data, counts_by_state: counts, total_amount: (data ?? []).reduce((s:number,t:any) => s + (t.amount??0), 0) };
    } else if (action === "get_evidence") {
      let q = supabase.from("evidence").select("*").order("uploaded_at", { ascending: false }).limit(limit);
      if (tax_year) q = q.eq("tax_year", tax_year);
      const { data, error } = await q; if (error) throw error;
      result = { evidence: data, total: data?.length ?? 0 };
    } else if (action === "get_invoices") {
      let q = supabase.from("invoices").select("id,type,invoice_number,created_at,client_name,amount,description,is_post_payment,tax_year").order("created_at", { ascending: false }).limit(limit);
      if (tax_year) q = q.eq("tax_year", tax_year);
      const { data, error } = await q; if (error) throw error;
      result = { invoices: data, total_invoiced: (data ?? []).reduce((s:number,i:any) => s + (i.amount??0), 0), count: data?.length ?? 0 };
    } else if (action === "get_reconciliations") {
      let q = supabase.from("income_reconciliations").select("id,source_type,source_description,gross_amount,net_amount,is_reconciled,discrepancy_amount,tax_year").limit(limit);
      if (tax_year) q = q.eq("tax_year", tax_year);
      if (status_filter === "unreconciled") q = q.eq("is_reconciled", false);
      const { data, error } = await q; if (error) throw error;
      result = { reconciliations: data, unreconciled_count: (data ?? []).filter((r:any) => !r.is_reconciled).length };
    } else if (action === "get_discrepancies") {
      let q = supabase.from("discrepancies").select("id,type,severity,description,source1,source1_value,resolution,resolved_at,tax_year").order("severity").limit(limit);
      if (tax_year) q = q.eq("tax_year", tax_year);
      if (status_filter === "unresolved") q = q.is("resolution", null);
      else if (status_filter) q = q.eq("severity", status_filter);
      const { data, error } = await q; if (error) throw error;
      const by_severity: Record<string,number> = {};
      for (const d of data ?? []) by_severity[d.severity] = (by_severity[d.severity] ?? 0) + 1;
      result = { discrepancies: data, unresolved_count: (data ?? []).filter((d:any) => !d.resolution).length, by_severity };
    } else if (action === "get_pl_report") {
      let q = supabase.from("pl_reports").select("*").order("generated_at", { ascending: false }).limit(1);
      if (tax_year) q = q.eq("tax_year", tax_year);
      const { data, error } = await q.single(); if (error) throw error;
      result = { pl_report: data };
    } else {
      result = { error: `Unknown action: ${action}` };
    }
  } catch (err: any) { result = { error: err.message }; }

  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});