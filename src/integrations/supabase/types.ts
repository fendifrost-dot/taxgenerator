export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      discrepancies: {
        Row: {
          created_at: string | null
          description: string
          id: string
          impacted_lines: Json | null
          impacted_totals: Json | null
          resolution: string | null
          resolution_action: string | null
          resolved_at: string | null
          resolved_value: string | null
          severity: string
          source1: string | null
          source1_value: string | null
          source2: string | null
          source2_value: string | null
          tax_year: number
          type: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          impacted_lines?: Json | null
          impacted_totals?: Json | null
          resolution?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_value?: string | null
          severity: string
          source1?: string | null
          source1_value?: string | null
          source2?: string | null
          source2_value?: string | null
          tax_year: number
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          impacted_lines?: Json | null
          impacted_totals?: Json | null
          resolution?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_value?: string | null
          severity?: string
          source1?: string | null
          source1_value?: string | null
          source2?: string | null
          source2_value?: string | null
          tax_year?: number
          type?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string | null
          detected_tax_year: number | null
          file_name: string
          id: string
          source_reference: string | null
          tax_year: number
          type: string
          uploaded_at: string | null
          verification_errors: Json | null
          verification_status: string | null
          year_mismatch_confirmed: boolean | null
        }
        Insert: {
          created_at?: string | null
          detected_tax_year?: number | null
          file_name: string
          id?: string
          source_reference?: string | null
          tax_year: number
          type: string
          uploaded_at?: string | null
          verification_errors?: Json | null
          verification_status?: string | null
          year_mismatch_confirmed?: boolean | null
        }
        Update: {
          created_at?: string | null
          detected_tax_year?: number | null
          file_name?: string
          id?: string
          source_reference?: string | null
          tax_year?: number
          type?: string
          uploaded_at?: string | null
          verification_errors?: Json | null
          verification_status?: string | null
          year_mismatch_confirmed?: boolean | null
        }
        Relationships: []
      }
      evidence: {
        Row: {
          business_purpose_note: string | null
          created_at: string | null
          file_name: string
          id: string
          tax_year: number
          transaction_id: string
          type: string
          uploaded_at: string | null
        }
        Insert: {
          business_purpose_note?: string | null
          created_at?: string | null
          file_name: string
          id?: string
          tax_year: number
          transaction_id: string
          type: string
          uploaded_at?: string | null
        }
        Update: {
          business_purpose_note?: string | null
          created_at?: string | null
          file_name?: string
          id?: string
          tax_year?: number
          transaction_id?: string
          type?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      income_reconciliations: {
        Row: {
          created_at: string | null
          discrepancy_amount: number | null
          discrepancy_note: string | null
          fees: number | null
          gross_amount: number
          id: string
          is_reconciled: boolean | null
          matched_deposit_ids: Json | null
          matched_transaction_ids: Json | null
          net_amount: number
          refunds_chargebacks: number | null
          source_description: string | null
          source_document_id: string | null
          source_type: string
          tax_year: number
        }
        Insert: {
          created_at?: string | null
          discrepancy_amount?: number | null
          discrepancy_note?: string | null
          fees?: number | null
          gross_amount: number
          id?: string
          is_reconciled?: boolean | null
          matched_deposit_ids?: Json | null
          matched_transaction_ids?: Json | null
          net_amount: number
          refunds_chargebacks?: number | null
          source_description?: string | null
          source_document_id?: string | null
          source_type: string
          tax_year: number
        }
        Update: {
          created_at?: string | null
          discrepancy_amount?: number | null
          discrepancy_note?: string | null
          fees?: number | null
          gross_amount?: number
          id?: string
          is_reconciled?: boolean | null
          matched_deposit_ids?: Json | null
          matched_transaction_ids?: Json | null
          net_amount?: number
          refunds_chargebacks?: number | null
          source_description?: string | null
          source_document_id?: string | null
          source_type?: string
          tax_year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          agreement_type: string | null
          amount: number
          client_identifier: string | null
          client_name: string
          created_at: string | null
          description: string
          id: string
          invoice_number: string | null
          is_post_payment: boolean | null
          linked_deposit_id: string | null
          linked_transaction_id: string | null
          platform: string | null
          service_timeframe: string | null
          tax_year: number
          type: string
        }
        Insert: {
          agreement_type?: string | null
          amount: number
          client_identifier?: string | null
          client_name: string
          created_at?: string | null
          description: string
          id?: string
          invoice_number?: string | null
          is_post_payment?: boolean | null
          linked_deposit_id?: string | null
          linked_transaction_id?: string | null
          platform?: string | null
          service_timeframe?: string | null
          tax_year: number
          type: string
        }
        Update: {
          agreement_type?: string | null
          amount?: number
          client_identifier?: string | null
          client_name?: string
          created_at?: string | null
          description?: string
          id?: string
          invoice_number?: string | null
          is_post_payment?: boolean | null
          linked_deposit_id?: string | null
          linked_transaction_id?: string | null
          platform?: string | null
          service_timeframe?: string | null
          tax_year?: number
          type?: string
        }
        Relationships: []
      }
      pl_reports: {
        Row: {
          category_breakdown: Json | null
          created_at: string | null
          generated_at: string | null
          gross_income: number | null
          id: string
          net_profit: number | null
          period: string
          period_end: string | null
          period_start: string | null
          schedule_c_mapping: Json | null
          tax_year: number
          total_expenses: number | null
        }
        Insert: {
          category_breakdown?: Json | null
          created_at?: string | null
          generated_at?: string | null
          gross_income?: number | null
          id?: string
          net_profit?: number | null
          period: string
          period_end?: string | null
          period_start?: string | null
          schedule_c_mapping?: Json | null
          tax_year: number
          total_expenses?: number | null
        }
        Update: {
          category_breakdown?: Json | null
          created_at?: string | null
          generated_at?: string | null
          gross_income?: number | null
          id?: string
          net_profit?: number | null
          period?: string
          period_end?: string | null
          period_start?: string | null
          schedule_c_mapping?: Json | null
          tax_year?: number
          total_expenses?: number | null
        }
        Relationships: []
      }
      state_configs: {
        Row: {
          created_at: string | null
          has_business_nexus: boolean | null
          id: string
          residency_status: string
          state_code: string
          state_name: string
          status: string | null
          tax_year_config_id: string
        }
        Insert: {
          created_at?: string | null
          has_business_nexus?: boolean | null
          id?: string
          residency_status: string
          state_code: string
          state_name: string
          status?: string | null
          tax_year_config_id: string
        }
        Update: {
          created_at?: string | null
          has_business_nexus?: boolean | null
          id?: string
          residency_status?: string
          state_code?: string
          state_name?: string
          status?: string | null
          tax_year_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_configs_tax_year_config_id_fkey"
            columns: ["tax_year_config_id"]
            isOneToOne: false
            referencedRelation: "tax_year_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_year_configs: {
        Row: {
          created_at: string | null
          finalized_at: string | null
          id: string
          is_locked: boolean | null
          last_modified: string | null
          locked_at: string | null
          status: string | null
          version: number | null
          year: number
        }
        Insert: {
          created_at?: string | null
          finalized_at?: string | null
          id?: string
          is_locked?: boolean | null
          last_modified?: string | null
          locked_at?: string | null
          status?: string | null
          version?: number | null
          year: number
        }
        Update: {
          created_at?: string | null
          finalized_at?: string | null
          id?: string
          is_locked?: boolean | null
          last_modified?: string | null
          locked_at?: string | null
          status?: string | null
          version?: number | null
          year?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          business_purpose: string | null
          category_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          date: string
          description: string
          evidence_status: string | null
          id: string
          rationale: string | null
          requires_business_purpose: boolean | null
          schedule_c_line: string | null
          source: string | null
          source_document_id: string | null
          state: string | null
          subcategory_id: string | null
          tax_year: number
        }
        Insert: {
          amount: number
          business_purpose?: string | null
          category_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          date: string
          description: string
          evidence_status?: string | null
          id?: string
          rationale?: string | null
          requires_business_purpose?: boolean | null
          schedule_c_line?: string | null
          source?: string | null
          source_document_id?: string | null
          state?: string | null
          subcategory_id?: string | null
          tax_year: number
        }
        Update: {
          amount?: number
          business_purpose?: string | null
          category_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          date?: string
          description?: string
          evidence_status?: string | null
          id?: string
          rationale?: string | null
          requires_business_purpose?: boolean | null
          schedule_c_line?: string | null
          source?: string | null
          source_document_id?: string | null
          state?: string | null
          subcategory_id?: string | null
          tax_year?: number
        }
        Relationships: []
      }
      workflow_states: {
        Row: {
          blocked_reasons: Json | null
          created_at: string | null
          federal_status: string | null
          gates: Json | null
          id: string
          state_statuses: Json | null
          tax_year: number
          unresolved_counts: Json | null
          updated_at: string | null
        }
        Insert: {
          blocked_reasons?: Json | null
          created_at?: string | null
          federal_status?: string | null
          gates?: Json | null
          id?: string
          state_statuses?: Json | null
          tax_year: number
          unresolved_counts?: Json | null
          updated_at?: string | null
        }
        Update: {
          blocked_reasons?: Json | null
          created_at?: string | null
          federal_status?: string | null
          gates?: Json | null
          id?: string
          state_statuses?: Json | null
          tax_year?: number
          unresolved_counts?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
