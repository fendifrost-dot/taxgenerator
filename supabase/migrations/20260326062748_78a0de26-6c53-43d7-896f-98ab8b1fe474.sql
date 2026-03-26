-- Create timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ===== TAX YEAR CONFIGS =====
CREATE TABLE public.tax_year_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer UNIQUE NOT NULL,
  status text DEFAULT 'draft',
  version integer DEFAULT 1,
  is_locked boolean DEFAULT false,
  locked_at timestamptz,
  finalized_at timestamptz,
  last_modified timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tax_year_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to tax_year_configs" ON public.tax_year_configs FOR ALL USING (true) WITH CHECK (true);

-- ===== STATE CONFIGS =====
CREATE TABLE public.state_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_config_id uuid REFERENCES public.tax_year_configs(id) ON DELETE CASCADE NOT NULL,
  state_code text NOT NULL,
  state_name text NOT NULL,
  residency_status text NOT NULL,
  has_business_nexus boolean DEFAULT false,
  status text DEFAULT 'not_started',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.state_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to state_configs" ON public.state_configs FOR ALL USING (true) WITH CHECK (true);

-- ===== DOCUMENTS =====
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  file_name text NOT NULL,
  uploaded_at timestamptz DEFAULT now(),
  tax_year integer NOT NULL,
  detected_tax_year integer,
  year_mismatch_confirmed boolean DEFAULT false,
  source_reference text,
  verification_status text DEFAULT 'pending',
  verification_errors jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);

-- ===== TRANSACTIONS =====
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  source text,
  source_document_id uuid,
  state text DEFAULT 'requires_decision',
  category_id text,
  subcategory_id text,
  schedule_c_line text,
  business_purpose text,
  evidence_status text DEFAULT 'missing',
  confirmed_at timestamptz,
  confirmed_by text,
  rationale text,
  requires_business_purpose boolean DEFAULT false,
  tax_year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

-- ===== EVIDENCE =====
CREATE TABLE public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  file_name text NOT NULL,
  uploaded_at timestamptz DEFAULT now(),
  business_purpose_note text,
  tax_year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to evidence" ON public.evidence FOR ALL USING (true) WITH CHECK (true);

-- ===== INVOICES =====
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  invoice_number text,
  client_name text NOT NULL,
  client_identifier text,
  platform text,
  amount numeric NOT NULL,
  description text NOT NULL,
  service_timeframe text,
  agreement_type text,
  is_post_payment boolean DEFAULT false,
  tax_year integer NOT NULL,
  linked_deposit_id uuid,
  linked_transaction_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- ===== INCOME RECONCILIATIONS =====
CREATE TABLE public.income_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_document_id uuid,
  source_description text,
  gross_amount numeric NOT NULL,
  fees numeric DEFAULT 0,
  refunds_chargebacks numeric DEFAULT 0,
  net_amount numeric NOT NULL,
  matched_deposit_ids jsonb DEFAULT '[]',
  matched_transaction_ids jsonb DEFAULT '[]',
  is_reconciled boolean DEFAULT false,
  discrepancy_amount numeric,
  discrepancy_note text,
  tax_year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.income_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to income_reconciliations" ON public.income_reconciliations FOR ALL USING (true) WITH CHECK (true);

-- ===== DISCREPANCIES =====
CREATE TABLE public.discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL,
  description text NOT NULL,
  source1 text,
  source1_value text,
  source2 text,
  source2_value text,
  impacted_totals jsonb,
  impacted_lines jsonb,
  resolution text,
  resolution_action text,
  resolved_value text,
  resolved_at timestamptz,
  tax_year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.discrepancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to discrepancies" ON public.discrepancies FOR ALL USING (true) WITH CHECK (true);

-- ===== WORKFLOW STATES =====
CREATE TABLE public.workflow_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year integer UNIQUE NOT NULL,
  federal_status text DEFAULT 'draft',
  state_statuses jsonb DEFAULT '{}',
  gates jsonb DEFAULT '{}',
  unresolved_counts jsonb DEFAULT '{}',
  blocked_reasons jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workflow_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to workflow_states" ON public.workflow_states FOR ALL USING (true) WITH CHECK (true);

-- ===== PL REPORTS =====
CREATE TABLE public.pl_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year integer NOT NULL,
  period text NOT NULL,
  period_start date,
  period_end date,
  gross_income numeric DEFAULT 0,
  total_expenses numeric DEFAULT 0,
  net_profit numeric DEFAULT 0,
  category_breakdown jsonb DEFAULT '[]',
  schedule_c_mapping jsonb DEFAULT '[]',
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pl_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to pl_reports" ON public.pl_reports FOR ALL USING (true) WITH CHECK (true);

-- Update trigger for workflow_states
CREATE TRIGGER update_workflow_states_updated_at
  BEFORE UPDATE ON public.workflow_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for tax_year_configs  
CREATE TRIGGER update_tax_year_configs_last_modified
  BEFORE UPDATE ON public.tax_year_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();