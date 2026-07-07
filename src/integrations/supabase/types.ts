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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_groups: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          is_system: boolean
          name: string
          nature: string | null
          parent_id: string | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_system?: boolean
          name: string
          nature?: string | null
          parent_id?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_system?: boolean
          name?: string
          nature?: string | null
          parent_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      accounting_settings: {
        Row: {
          business_id: string
          lock_date: string | null
          locked_at: string | null
          locked_by: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          lock_date?: string | null
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          lock_date?: string | null
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_logs: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          module_name: string | null
          prompt: string | null
          response: Json | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          module_name?: string | null
          prompt?: string | null
          response?: Json | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          module_name?: string | null
          prompt?: string | null
          response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_purchase_suggestions: {
        Row: {
          business_id: string | null
          generated_at: string | null
          id: string
          product_id: string | null
          reason: string | null
          suggested_qty: number | null
        }
        Insert: {
          business_id?: string | null
          generated_at?: string | null
          id?: string
          product_id?: string | null
          reason?: string | null
          suggested_qty?: number | null
        }
        Update: {
          business_id?: string | null
          generated_at?: string | null
          id?: string
          product_id?: string | null
          reason?: string | null
          suggested_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_purchase_suggestions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_purchase_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_levels: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          level_no: number
          module_name: string
          role_name: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          level_no: number
          module_name: string
          role_name: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          level_no?: number
          module_name?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_levels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          action_type: Database["public"]["Enums"]["approval_action"]
          after_snapshot: Json | null
          applied_at: string | null
          apply_error: string | null
          approved_at: string | null
          approved_by: string | null
          before_snapshot: Json | null
          business_id: string
          created_at: string
          document_no: string | null
          id: string
          module: string
          reason: string | null
          record_id: string
          rejected_at: string | null
          rejection_reason: string | null
          request_data: Json | null
          requested_by: string
          requested_by_role: Database["public"]["Enums"]["business_role"] | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["approval_action"]
          after_snapshot?: Json | null
          applied_at?: string | null
          apply_error?: string | null
          approved_at?: string | null
          approved_by?: string | null
          before_snapshot?: Json | null
          business_id: string
          created_at?: string
          document_no?: string | null
          id?: string
          module: string
          reason?: string | null
          record_id: string
          rejected_at?: string | null
          rejection_reason?: string | null
          request_data?: Json | null
          requested_by: string
          requested_by_role?:
            | Database["public"]["Enums"]["business_role"]
            | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["approval_action"]
          after_snapshot?: Json | null
          applied_at?: string | null
          apply_error?: string | null
          approved_at?: string | null
          approved_by?: string | null
          before_snapshot?: Json | null
          business_id?: string
          created_at?: string
          document_no?: string | null
          id?: string
          module?: string
          reason?: string | null
          record_id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          request_data?: Json | null
          requested_by?: string
          requested_by_role?:
            | Database["public"]["Enums"]["business_role"]
            | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          business_id: string
          employee_id: string | null
          id: string
          status: string | null
        }
        Insert: {
          attendance_date: string
          business_id: string
          employee_id?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          attendance_date?: string
          business_id?: string
          employee_id?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          business_id: string | null
          changed_by: string | null
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          business_id?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          business_id?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          business_id: string | null
          created_at: string | null
          device: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          module_name: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          record_id: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          business_id?: string | null
          created_at?: string | null
          device?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          module_name?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          business_id?: string | null
          created_at?: string | null
          device?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          module_name?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string | null
          bank_name: string
          business_id: string
          created_at: string | null
          current_balance: number | null
          id: string
          ifsc_code: string | null
          opening_balance: number | null
        }
        Insert: {
          account_name: string
          account_number?: string | null
          bank_name: string
          business_id: string
          created_at?: string | null
          current_balance?: number | null
          id?: string
          ifsc_code?: string | null
          opening_balance?: number | null
        }
        Update: {
          account_name?: string
          account_number?: string | null
          bank_name?: string
          business_id?: string
          created_at?: string | null
          current_balance?: number | null
          id?: string
          ifsc_code?: string | null
          opening_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation: {
        Row: {
          bank_transaction_id: string | null
          business_id: string
          id: string
          reconciled_at: string | null
          reconciled_by: string | null
        }
        Insert: {
          bank_transaction_id?: string | null
          business_id: string
          id?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
        }
        Update: {
          bank_transaction_id?: string | null
          business_id?: string
          id?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          bank_account_id: string | null
          business_id: string
          credit: number | null
          debit: number | null
          id: string
          narration: string | null
          reconciled: boolean | null
          reference_no: string | null
          transaction_date: string | null
        }
        Insert: {
          bank_account_id?: string | null
          business_id: string
          credit?: number | null
          debit?: number | null
          id?: string
          narration?: string | null
          reconciled?: boolean | null
          reference_no?: string | null
          transaction_date?: string | null
        }
        Update: {
          bank_account_id?: string | null
          business_id?: string
          credit?: number | null
          debit?: number | null
          id?: string
          narration?: string | null
          reconciled?: boolean | null
          reference_no?: string | null
          transaction_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          bom_id: string | null
          id: string
          qty: number | null
          raw_material_id: string | null
        }
        Insert: {
          bom_id?: string | null
          id?: string
          qty?: number | null
          raw_material_id?: string | null
        }
        Update: {
          bom_id?: string | null
          id?: string
          qty?: number | null
          raw_material_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_master: {
        Row: {
          business_id: string
          id: string
          product_id: string | null
          version_no: number | null
        }
        Insert: {
          business_id: string
          id?: string
          product_id?: string | null
          version_no?: number | null
        }
        Update: {
          business_id?: string
          id?: string
          product_id?: string | null
          version_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_master_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_master_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          code: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_features: {
        Row: {
          business_id: string | null
          enabled: boolean | null
          feature_id: string | null
          id: string
        }
        Insert: {
          business_id?: string | null
          enabled?: boolean | null
          feature_id?: string | null
          id?: string
        }
        Update: {
          business_id?: string | null
          enabled?: boolean | null
          feature_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_features_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          invitation_status: string | null
          invited_by: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          invitation_status?: string | null
          invited_by?: string | null
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          invitation_status?: string | null
          invited_by?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_users: {
        Row: {
          business_id: string | null
          created_at: string | null
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          mobile: string | null
          notes: string | null
          role: string | null
          status: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          mobile?: string | null
          notes?: string | null
          role?: string | null
          status?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          mobile?: string | null
          notes?: string | null
          role?: string | null
          status?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          archived_at: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          business_name: string | null
          business_type: string | null
          city: string | null
          composition_scheme: boolean | null
          created_at: string | null
          default_gst_pct: number | null
          district: string | null
          email: string | null
          firm_name: string | null
          fy_start_month: number | null
          gst_enabled: boolean | null
          gst_number: string | null
          gstin: string | null
          id: string
          industry_segment: string | null
          invoice_prefix: string | null
          invoice_terms: string | null
          logo_url: string | null
          mobile: string | null
          msme_number: string | null
          name: string | null
          owner_id: string | null
          owner_name: string | null
          pan_number: string | null
          phone: string | null
          pincode: string | null
          setup_completed: boolean | null
          state: string | null
          state_code: string | null
          tan_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          composition_scheme?: boolean | null
          created_at?: string | null
          default_gst_pct?: number | null
          district?: string | null
          email?: string | null
          firm_name?: string | null
          fy_start_month?: number | null
          gst_enabled?: boolean | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          industry_segment?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          mobile?: string | null
          msme_number?: string | null
          name?: string | null
          owner_id?: string | null
          owner_name?: string | null
          pan_number?: string | null
          phone?: string | null
          pincode?: string | null
          setup_completed?: boolean | null
          state?: string | null
          state_code?: string | null
          tan_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          composition_scheme?: boolean | null
          created_at?: string | null
          default_gst_pct?: number | null
          district?: string | null
          email?: string | null
          firm_name?: string | null
          fy_start_month?: number | null
          gst_enabled?: boolean | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          industry_segment?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          mobile?: string | null
          msme_number?: string | null
          name?: string | null
          owner_id?: string | null
          owner_name?: string | null
          pan_number?: string | null
          phone?: string | null
          pincode?: string | null
          setup_completed?: boolean | null
          state?: string | null
          state_code?: string | null
          tan_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      calculations: {
        Row: {
          after_rd: number
          bill_amount: number
          bill_discount: number
          bill_on_mrp: number
          business_id: string | null
          calculation_type: string | null
          cd_discount: number | null
          created_at: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          mode: string | null
          notes: string | null
          party_id: string | null
          party_name: string | null
          rd_amount: number
          required_discount: number
          result: number | null
          segment_id: string | null
          total_benefit: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          after_rd: number
          bill_amount: number
          bill_discount: number
          bill_on_mrp: number
          business_id?: string | null
          calculation_type?: string | null
          cd_discount?: number | null
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          mode?: string | null
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          rd_amount: number
          required_discount: number
          result?: number | null
          segment_id?: string | null
          total_benefit?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          after_rd?: number
          bill_amount?: number
          bill_discount?: number
          bill_on_mrp?: number
          business_id?: string | null
          calculation_type?: string | null
          cd_discount?: number | null
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          mode?: string | null
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          rd_amount?: number
          required_discount?: number
          result?: number | null
          segment_id?: string | null
          total_benefit?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      credit_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string
          id: string
          order_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          id?: string
          order_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_approvals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_approvals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "credit_approvals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_holds: {
        Row: {
          business_id: string
          created_at: string | null
          hold_reason: string | null
          id: string
          party_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          hold_reason?: string | null
          id?: string
          party_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          hold_reason?: string | null
          id?: string
          party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_holds_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_holds_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_limits: {
        Row: {
          business_id: string
          created_at: string | null
          credit_days: number | null
          credit_limit: number | null
          id: string
          party_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          id?: string
          party_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          id?: string
          party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_limits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_limits_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_followups: {
        Row: {
          business_id: string
          followup_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
        }
        Insert: {
          business_id: string
          followup_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
        }
        Update: {
          business_id?: string
          followup_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_followups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          business_id: string
          company_name: string | null
          created_at: string | null
          email: string | null
          id: string
          lead_name: string
          phone: string | null
          status: string | null
        }
        Insert: {
          business_id: string
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lead_name: string
          phone?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lead_name?: string
          phone?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_price_mapping: {
        Row: {
          business_id: string | null
          id: string
          party_id: string | null
          price_list_id: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          party_id?: string | null
          price_list_id?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          party_id?: string | null
          price_list_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_price_mapping_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_price_mapping_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_price_mapping_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_applications: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          company_name: string
          contact_name: string
          created_at: string
          email: string
          gstin: string | null
          id: string
          phone: string
          portal_type: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          address?: string | null
          business_id: string
          city?: string | null
          company_name: string
          contact_name: string
          created_at?: string
          email: string
          gstin?: string | null
          id?: string
          phone: string
          portal_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          gstin?: string | null
          id?: string
          phone?: string
          portal_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_applications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_notifications: {
        Row: {
          body: string | null
          business_id: string
          created_at: string
          id: string
          is_read: boolean
          party_id: string
          title: string
        }
        Insert: {
          body?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          party_id: string
          title: string
        }
        Update: {
          body?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          party_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_notifications_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_portal_users: {
        Row: {
          business_id: string | null
          id: string
          last_login: string | null
          party_id: string | null
          password_hash: string | null
          username: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          last_login?: string | null
          party_id?: string | null
          password_hash?: string | null
          username?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          last_login?: string | null
          party_id?: string | null
          password_hash?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_portal_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_portal_users_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_price_lists: {
        Row: {
          business_id: string | null
          created_at: string | null
          dealer_name: string | null
          id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          dealer_name?: string | null
          id?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          dealer_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_price_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_targets: {
        Row: {
          business_id: string | null
          id: string
          party_id: string | null
          target_amount: number | null
          target_period: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          party_id?: string | null
          target_amount?: number | null
          target_period?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          party_id?: string | null
          target_amount?: number | null
          target_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_targets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_targets_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          business_id: string
          id: string
          name: string
        }
        Insert: {
          business_id: string
          id?: string
          name: string
        }
        Update: {
          business_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_items: {
        Row: {
          business_id: string | null
          created_at: string | null
          dispatch_id: string | null
          dispatched_qty: number | null
          id: string
          invoiced_qty: number
          order_item_id: string | null
          part_number: string | null
          product_name: string | null
          qty: number | null
          rate: number | null
          total: number | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          dispatch_id?: string | null
          dispatched_qty?: number | null
          id?: string
          invoiced_qty?: number
          order_item_id?: string | null
          part_number?: string | null
          product_name?: string | null
          qty?: number | null
          rate?: number | null
          total?: number | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          dispatch_id?: string | null
          dispatched_qty?: number | null
          id?: string
          invoiced_qty?: number
          order_item_id?: string | null
          part_number?: string | null
          product_name?: string | null
          qty?: number | null
          rate?: number | null
          total?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          box_count: number | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          case_count: number | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dispatch_date: string | null
          dispatch_number: string
          dispatch_remarks: string | null
          eway_number: string | null
          id: string
          invoice_id: string | null
          is_deleted: boolean
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          lr_number: string | null
          notes: string | null
          order_id: string | null
          packing_remarks: string | null
          packing_slip_number: string | null
          party_id: string | null
          remarks: string | null
          status: string | null
          tracking_number: string | null
          transport_name: string | null
          transporter: string | null
          updated_at: string | null
          user_id: string
          vehicle_number: string | null
        }
        Insert: {
          box_count?: number | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          case_count?: number | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dispatch_date?: string | null
          dispatch_number: string
          dispatch_remarks?: string | null
          eway_number?: string | null
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          lr_number?: string | null
          notes?: string | null
          order_id?: string | null
          packing_remarks?: string | null
          packing_slip_number?: string | null
          party_id?: string | null
          remarks?: string | null
          status?: string | null
          tracking_number?: string | null
          transport_name?: string | null
          transporter?: string | null
          updated_at?: string | null
          user_id: string
          vehicle_number?: string | null
        }
        Update: {
          box_count?: number | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          case_count?: number | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dispatch_date?: string | null
          dispatch_number?: string
          dispatch_remarks?: string | null
          eway_number?: string | null
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          lr_number?: string | null
          notes?: string | null
          order_id?: string | null
          packing_remarks?: string | null
          packing_slip_number?: string | null
          party_id?: string | null
          remarks?: string | null
          status?: string | null
          tracking_number?: string | null
          transport_name?: string | null
          transporter?: string | null
          updated_at?: string | null
          user_id?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_categories: {
        Row: {
          business_id: string | null
          category_name: string
          id: string
          parent_id: string | null
        }
        Insert: {
          business_id?: string | null
          category_name: string
          id?: string
          parent_id?: string | null
        }
        Update: {
          business_id?: string | null
          category_name?: string
          id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_orders: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_mobile: string | null
          customer_name: string | null
          id: string
          order_status: string | null
          total_amount: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          customer_mobile?: string | null
          customer_name?: string | null
          id?: string
          order_status?: string | null
          total_amount?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          customer_mobile?: string | null
          customer_name?: string | null
          id?: string
          order_status?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ecommerce_stores: {
        Row: {
          business_id: string | null
          created_at: string | null
          domain_name: string | null
          id: string
          is_active: boolean | null
          store_name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          domain_name?: string | null
          id?: string
          is_active?: boolean | null
          store_name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          domain_name?: string | null
          id?: string
          is_active?: boolean | null
          store_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_stores_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_logs: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          invoice_id: string | null
          irn: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          irn?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          irn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string | null
          email: string | null
          employee_code: string | null
          full_name: string
          id: string
          joining_date: string | null
          phone: string | null
          status: string | null
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string | null
          email?: string | null
          employee_code?: string | null
          full_name: string
          id?: string
          joining_date?: string | null
          phone?: string | null
          status?: string | null
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          joining_date?: string | null
          phone?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ewaybill_logs: {
        Row: {
          business_id: string
          created_at: string | null
          eway_bill_no: string | null
          id: string
          invoice_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          eway_bill_no?: string | null
          id?: string
          invoice_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          eway_bill_no?: string | null
          id?: string
          invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewaybill_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewaybill_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          code: string
          id: string
          name: string
        }
        Insert: {
          code: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      financial_years: {
        Row: {
          business_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          end_date: string
          fy_name: string
          id: string
          is_closed: boolean | null
          is_current: boolean | null
          start_date: string
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date: string
          fy_name: string
          id?: string
          is_closed?: boolean | null
          is_current?: boolean | null
          start_date: string
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date?: string
          fy_name?: string
          id?: string
          is_closed?: boolean | null
          is_current?: boolean | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_snapshots: {
        Row: {
          business_id: string | null
          confidence_score: number | null
          expected_qty: number | null
          forecast_date: string | null
          id: string
          product_id: string | null
        }
        Insert: {
          business_id?: string | null
          confidence_score?: number | null
          expected_qty?: number | null
          forecast_date?: string | null
          id?: string
          product_id?: string | null
        }
        Update: {
          business_id?: string | null
          confidence_score?: number | null
          expected_qty?: number | null
          forecast_date?: string | null
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          accepted_qty: number
          created_at: string
          damaged_qty: number
          excess_qty: number
          goods_receipt_id: string
          id: string
          ordered_qty: number
          pending_qty: number
          product_id: string
          quality_remarks: string | null
          received_qty: number
          short_qty: number
        }
        Insert: {
          accepted_qty?: number
          created_at?: string
          damaged_qty?: number
          excess_qty?: number
          goods_receipt_id: string
          id?: string
          ordered_qty?: number
          pending_qty?: number
          product_id: string
          quality_remarks?: string | null
          received_qty?: number
          short_qty?: number
        }
        Update: {
          accepted_qty?: number
          created_at?: string
          damaged_qty?: number
          excess_qty?: number
          goods_receipt_id?: string
          id?: string
          ordered_qty?: number
          pending_qty?: number
          product_id?: string
          quality_remarks?: string | null
          received_qty?: number
          short_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          grn_date: string
          grn_number: string
          id: string
          purchase_order_id: string | null
          remarks: string | null
          status: string
          supplier_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          grn_date?: string
          grn_number: string
          id?: string
          purchase_order_id?: string | null
          remarks?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          grn_date?: string
          grn_number?: string
          id?: string
          purchase_order_id?: string | null
          remarks?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_hsn_summary: {
        Row: {
          business_id: string
          hsn_code: string | null
          id: string
          tax_amount: number | null
          taxable_value: number | null
        }
        Insert: {
          business_id: string
          hsn_code?: string | null
          id?: string
          tax_amount?: number | null
          taxable_value?: number | null
        }
        Update: {
          business_id?: string
          hsn_code?: string | null
          id?: string
          tax_amount?: number | null
          taxable_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_hsn_summary_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_documents: {
        Row: {
          id: string
          invoice_id: string | null
          return_period_id: string | null
          tax_amount: number | null
          taxable_value: number | null
        }
        Insert: {
          id?: string
          invoice_id?: string | null
          return_period_id?: string | null
          tax_amount?: number | null
          taxable_value?: number | null
        }
        Update: {
          id?: string
          invoice_id?: string | null
          return_period_id?: string | null
          tax_amount?: number | null
          taxable_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gst_return_documents_return_period_id_fkey"
            columns: ["return_period_id"]
            isOneToOne: false
            referencedRelation: "gst_return_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_items: {
        Row: {
          gst_return_id: string | null
          id: string
          invoice_id: string | null
          tax_amount: number | null
          taxable_value: number | null
        }
        Insert: {
          gst_return_id?: string | null
          id?: string
          invoice_id?: string | null
          tax_amount?: number | null
          taxable_value?: number | null
        }
        Update: {
          gst_return_id?: string | null
          id?: string
          invoice_id?: string | null
          tax_amount?: number | null
          taxable_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_items_gst_return_id_fkey"
            columns: ["gst_return_id"]
            isOneToOne: false
            referencedRelation: "gst_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gst_return_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_periods: {
        Row: {
          business_id: string
          id: string
          period_month: number | null
          period_year: number | null
          return_type: string | null
          status: string | null
        }
        Insert: {
          business_id: string
          id?: string
          period_month?: number | null
          period_year?: number | null
          return_type?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          period_month?: number | null
          period_year?: number | null
          return_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_periods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_returns: {
        Row: {
          business_id: string
          id: string
          period: string | null
          return_type: string | null
          status: string | null
        }
        Insert: {
          business_id: string
          id?: string
          period?: string | null
          return_type?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          period?: string | null
          return_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_claims: {
        Row: {
          business_id: string | null
          claim_amount: number | null
          claim_status: string | null
          id: string
          party_id: string | null
          scheme_id: string | null
        }
        Insert: {
          business_id?: string | null
          claim_amount?: number | null
          claim_status?: string | null
          id?: string
          party_id?: string | null
          scheme_id?: string | null
        }
        Update: {
          business_id?: string | null
          claim_amount?: number | null
          claim_status?: string | null
          id?: string
          party_id?: string | null
          scheme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentive_claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_claims_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incentive_claims_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adjustment_type: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          product_id: string | null
          qty: number | null
          reason: string | null
          remarks: string | null
          status: string
          user_id: string
        }
        Insert: {
          adjustment_type?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          product_id?: string | null
          qty?: number | null
          reason?: string | null
          remarks?: string | null
          status?: string
          user_id: string
        }
        Update: {
          adjustment_type?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          product_id?: string | null
          qty?: number | null
          reason?: string | null
          remarks?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_cost_layers: {
        Row: {
          business_id: string
          id: string
          product_id: string | null
          qty_received: number | null
          qty_remaining: number | null
          receipt_date: string | null
          unit_cost: number | null
        }
        Insert: {
          business_id: string
          id?: string
          product_id?: string | null
          qty_received?: number | null
          qty_remaining?: number | null
          receipt_date?: string | null
          unit_cost?: number | null
        }
        Update: {
          business_id?: string
          id?: string
          product_id?: string | null
          qty_received?: number | null
          qty_remaining?: number | null
          receipt_date?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cost_layers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_layers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_import_logs: {
        Row: {
          business_id: string | null
          created_at: string
          errors: Json | null
          failed_count: number
          file_name: string | null
          id: string
          import_mode: string
          success_count: number
          summary: Json | null
          total_rows: number
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          errors?: Json | null
          failed_count?: number
          file_name?: string | null
          id?: string
          import_mode?: string
          success_count?: number
          summary?: Json | null
          total_rows?: number
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          errors?: Json | null
          failed_count?: number
          file_name?: string | null
          id?: string
          import_mode?: string
          success_count?: number
          summary?: Json | null
          total_rows?: number
          user_id?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          qty: number
          reference_id: string | null
          reference_type: string | null
          remarks: string | null
          stock_after: number
          stock_before: number
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          movement_type: string
          notes?: string | null
          product_id: string
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          remarks?: string | null
          stock_after?: number
          stock_before?: number
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          remarks?: string | null
          stock_after?: number
          stock_before?: number
          user_id?: string
        }
        Relationships: []
      }
      inventory_valuation: {
        Row: {
          business_id: string
          id: string
          product_id: string | null
          stock_qty: number | null
          stock_value: number | null
          valuation_date: string | null
          valuation_method: string | null
        }
        Insert: {
          business_id: string
          id?: string
          product_id?: string | null
          stock_qty?: number | null
          stock_value?: number | null
          valuation_date?: string | null
          valuation_method?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          product_id?: string | null
          stock_qty?: number | null
          stock_value?: number | null
          valuation_date?: string | null
          valuation_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_valuation_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_type: string | null
          business_id: string | null
          created_at: string | null
          current_balance: number | null
          group_id: string | null
          id: string
          is_system: boolean | null
          ledger_type: string | null
          name: string
          notes: string | null
          opening_balance: number | null
          opening_balance_type: string
          parent_account_id: string | null
          party_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_type?: string | null
          business_id?: string | null
          created_at?: string | null
          current_balance?: number | null
          group_id?: string | null
          id?: string
          is_system?: boolean | null
          ledger_type?: string | null
          name: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_type?: string
          parent_account_id?: string | null
          party_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_type?: string | null
          business_id?: string | null
          created_at?: string | null
          current_balance?: number | null
          group_id?: string | null
          id?: string
          is_system?: boolean | null
          ledger_type?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_type?: string
          parent_account_id?: string | null
          party_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          business_id: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string | null
          entry_type: string
          id: string
          ledger_account_id: string | null
          narration: string | null
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          amount: number
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          entry_type: string
          id?: string
          ledger_account_id?: string | null
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          amount?: number
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          entry_type?: string
          id?: string
          ledger_account_id?: string | null
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_customers: {
        Row: {
          business_id: string | null
          customer_name: string | null
          id: string
          mobile: string | null
          points: number | null
        }
        Insert: {
          business_id?: string | null
          customer_name?: string | null
          id?: string
          mobile?: string | null
          points?: number | null
        }
        Update: {
          business_id?: string | null
          customer_name?: string | null
          id?: string
          mobile?: string | null
          points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          customer_id: string | null
          id: string
          points: number | null
          transaction_type: string | null
        }
        Insert: {
          customer_id?: string | null
          id?: string
          points?: number | null
          transaction_type?: string | null
        }
        Update: {
          customer_id?: string | null
          id?: string
          points?: number | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "loyalty_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_channels: {
        Row: {
          api_key: string | null
          business_id: string | null
          channel_name: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          api_key?: string | null
          business_id?: string | null
          channel_name: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          api_key?: string | null
          business_id?: string | null
          channel_name?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_channels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          business_id: string | null
          channel_id: string | null
          created_at: string | null
          external_order_no: string | null
          id: string
          order_amount: number | null
        }
        Insert: {
          business_id?: string | null
          channel_id?: string | null
          created_at?: string | null
          external_order_no?: string | null
          id?: string
          order_amount?: number | null
        }
        Update: {
          business_id?: string | null
          channel_id?: string | null
          created_at?: string | null
          external_order_no?: string | null
          id?: string
          order_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "marketplace_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_products: {
        Row: {
          business_id: string | null
          channel_id: string | null
          external_sku: string | null
          id: string
          product_id: string | null
        }
        Insert: {
          business_id?: string | null
          channel_id?: string | null
          external_sku?: string | null
          id?: string
          product_id?: string | null
        }
        Update: {
          business_id?: string | null
          channel_id?: string | null
          external_sku?: string | null
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "marketplace_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_sync_logs: {
        Row: {
          business_id: string | null
          channel_id: string | null
          created_at: string | null
          id: string
          status: string | null
          sync_type: string | null
        }
        Insert: {
          business_id?: string | null
          channel_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          sync_type?: string | null
        }
        Update: {
          business_id?: string | null
          channel_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          sync_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_sync_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_sync_logs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "marketplace_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          delivery_status: string | null
          id: string
          notification_id: string | null
          sent_at: string | null
        }
        Insert: {
          delivery_status?: string | null
          id?: string
          notification_id?: string | null
          sent_at?: string | null
        }
        Update: {
          delivery_status?: string | null
          id?: string
          notification_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          business_id: string | null
          channel: string | null
          id: string
          template_body: string | null
          template_name: string | null
        }
        Insert: {
          business_id?: string | null
          channel?: string | null
          id?: string
          template_body?: string | null
          template_name?: string | null
        }
        Update: {
          business_id?: string | null
          channel?: string | null
          id?: string
          template_body?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          business_id: string | null
          channel: string | null
          created_at: string | null
          id: string
          message: string | null
          recipient: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          business_id?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          recipient?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          business_id?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          recipient?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_activity_logs: {
        Row: {
          action: string
          business_id: string | null
          created_at: string
          description: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          order_id: string
          user_id: string
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          order_id: string
          user_id: string
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          order_id?: string
          user_id?: string
        }
        Relationships: []
      }
      order_import_logs: {
        Row: {
          business_id: string | null
          created_at: string
          errors: Json | null
          failed_count: number
          file_name: string | null
          id: string
          import_mode: string
          order_id: string | null
          success_count: number
          summary: Json | null
          total_rows: number
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          errors?: Json | null
          failed_count?: number
          file_name?: string | null
          id?: string
          import_mode?: string
          order_id?: string | null
          success_count?: number
          summary?: Json | null
          total_rows?: number
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          errors?: Json | null
          failed_count?: number
          file_name?: string | null
          id?: string
          import_mode?: string
          order_id?: string | null
          success_count?: number
          summary?: Json | null
          total_rows?: number
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          agreed_discount: number | null
          amount: number | null
          cd_amount: number | null
          cd_percent: number | null
          cgst: number | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          description: string | null
          device_id: string | null
          disc_percent: number | null
          discount: number | null
          discount_amount: number | null
          discount_pct: number | null
          discount_percent: number | null
          dispatched_qty: number | null
          effective_discount: number | null
          final_amount: number | null
          gross_amount: number | null
          gst_amount: number | null
          gst_pct: number | null
          gst_percent: number | null
          hsn: string | null
          hsn_sac: string | null
          id: string
          igst: number | null
          is_deleted: boolean | null
          is_manual: boolean | null
          item_name: string | null
          item_no: number | null
          item_status: string | null
          item_type: string | null
          line_no: number | null
          mrp: number | null
          net_rate: number | null
          order_id: string | null
          owner_id: string | null
          part_number: string | null
          pending_qty: number | null
          position: number | null
          price: number | null
          product_id: string | null
          product_name: string | null
          purchase_price: number | null
          qty: number | null
          rack: string | null
          rate: number | null
          rd_amount: number | null
          rd_percent: number | null
          remarks: string | null
          row_number: number | null
          session_id: string | null
          sgst: number | null
          sort_order: number | null
          stock_after: number | null
          stock_before: number | null
          taxable_amount: number | null
          total: number | null
          updated_by: string | null
          updated_by_name: string | null
          user_id: string | null
          vehicle_model: string | null
        }
        Insert: {
          agreed_discount?: number | null
          amount?: number | null
          cd_amount?: number | null
          cd_percent?: number | null
          cgst?: number | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          device_id?: string | null
          disc_percent?: number | null
          discount?: number | null
          discount_amount?: number | null
          discount_pct?: number | null
          discount_percent?: number | null
          dispatched_qty?: number | null
          effective_discount?: number | null
          final_amount?: number | null
          gross_amount?: number | null
          gst_amount?: number | null
          gst_pct?: number | null
          gst_percent?: number | null
          hsn?: string | null
          hsn_sac?: string | null
          id?: string
          igst?: number | null
          is_deleted?: boolean | null
          is_manual?: boolean | null
          item_name?: string | null
          item_no?: number | null
          item_status?: string | null
          item_type?: string | null
          line_no?: number | null
          mrp?: number | null
          net_rate?: number | null
          order_id?: string | null
          owner_id?: string | null
          part_number?: string | null
          pending_qty?: number | null
          position?: number | null
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          purchase_price?: number | null
          qty?: number | null
          rack?: string | null
          rate?: number | null
          rd_amount?: number | null
          rd_percent?: number | null
          remarks?: string | null
          row_number?: number | null
          session_id?: string | null
          sgst?: number | null
          sort_order?: number | null
          stock_after?: number | null
          stock_before?: number | null
          taxable_amount?: number | null
          total?: number | null
          updated_by?: string | null
          updated_by_name?: string | null
          user_id?: string | null
          vehicle_model?: string | null
        }
        Update: {
          agreed_discount?: number | null
          amount?: number | null
          cd_amount?: number | null
          cd_percent?: number | null
          cgst?: number | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          device_id?: string | null
          disc_percent?: number | null
          discount?: number | null
          discount_amount?: number | null
          discount_pct?: number | null
          discount_percent?: number | null
          dispatched_qty?: number | null
          effective_discount?: number | null
          final_amount?: number | null
          gross_amount?: number | null
          gst_amount?: number | null
          gst_pct?: number | null
          gst_percent?: number | null
          hsn?: string | null
          hsn_sac?: string | null
          id?: string
          igst?: number | null
          is_deleted?: boolean | null
          is_manual?: boolean | null
          item_name?: string | null
          item_no?: number | null
          item_status?: string | null
          item_type?: string | null
          line_no?: number | null
          mrp?: number | null
          net_rate?: number | null
          order_id?: string | null
          owner_id?: string | null
          part_number?: string | null
          pending_qty?: number | null
          position?: number | null
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          purchase_price?: number | null
          qty?: number | null
          rack?: string | null
          rate?: number | null
          rd_amount?: number | null
          rd_percent?: number | null
          remarks?: string | null
          row_number?: number | null
          session_id?: string | null
          sgst?: number | null
          sort_order?: number | null
          stock_after?: number | null
          stock_before?: number | null
          taxable_amount?: number | null
          total?: number | null
          updated_by?: string | null
          updated_by_name?: string | null
          user_id?: string | null
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          agreed_discount: number | null
          billing_address: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          cd_total: number | null
          cgst_amount: number | null
          child_order_ids: string[] | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_type: string | null
          default_discount: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          device_info: string | null
          discount: number | null
          discount_amount: number | null
          discount_mode: string | null
          discount_total: number | null
          due_amount: number | null
          effective_discount: number | null
          extra_charges: number | null
          grand_total: number | null
          gst_number: string | null
          gst_total: number | null
          handling_charges: number | null
          id: string
          igst_amount: number | null
          import_batch_id: string | null
          insurance_charges: number | null
          is_deleted: boolean
          is_locked: boolean
          items_snapshot: Json | null
          loading_charges: number | null
          locked_at: string | null
          locked_by: string | null
          merged_from: string[] | null
          metadata: Json | null
          mode: string | null
          narration: string | null
          notes: string | null
          order_date: string | null
          order_group_id: string | null
          order_number: string
          order_type: string | null
          packing_charges: number | null
          paid_amount: number | null
          parent_order_id: string | null
          parent_order_ids: string[] | null
          party_address: string | null
          party_code: string | null
          party_gst: string | null
          party_gstin: string | null
          party_id: string | null
          party_name: string | null
          party_phone: string | null
          party_snapshot: Json | null
          payment_method: string | null
          payment_status: string | null
          pending_total_qty: number | null
          pricing_snapshot: Json | null
          rd_extra: number | null
          rd_mode: boolean | null
          ref_no: string | null
          reference_no: string | null
          reference_order_number: string | null
          remarks: string | null
          round_off: number | null
          roundoff_amount: number | null
          salesman: string | null
          salesman_id: string | null
          sgst_amount: number | null
          shipping_address: string | null
          shipping_charges: number | null
          source_channel: string | null
          source_id: string | null
          source_reference: string | null
          source_type: string | null
          split_from: string | null
          status: string | null
          subtotal: number | null
          sync_error: string | null
          sync_status: string | null
          tax: number | null
          tax_snapshot: Json | null
          taxable_amount: number | null
          total_amount: number | null
          total_items: number | null
          total_qty: number | null
          transport_charges: number | null
          transport_name: string | null
          unloading_charges: number | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
          vehicle_number: string | null
          voucher_no: string | null
          voucher_type: string | null
        }
        Insert: {
          agreed_discount?: number | null
          billing_address?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          cd_total?: number | null
          cgst_amount?: number | null
          child_order_ids?: string[] | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_type?: string | null
          default_discount?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          device_info?: string | null
          discount?: number | null
          discount_amount?: number | null
          discount_mode?: string | null
          discount_total?: number | null
          due_amount?: number | null
          effective_discount?: number | null
          extra_charges?: number | null
          grand_total?: number | null
          gst_number?: string | null
          gst_total?: number | null
          handling_charges?: number | null
          id?: string
          igst_amount?: number | null
          import_batch_id?: string | null
          insurance_charges?: number | null
          is_deleted?: boolean
          is_locked?: boolean
          items_snapshot?: Json | null
          loading_charges?: number | null
          locked_at?: string | null
          locked_by?: string | null
          merged_from?: string[] | null
          metadata?: Json | null
          mode?: string | null
          narration?: string | null
          notes?: string | null
          order_date?: string | null
          order_group_id?: string | null
          order_number: string
          order_type?: string | null
          packing_charges?: number | null
          paid_amount?: number | null
          parent_order_id?: string | null
          parent_order_ids?: string[] | null
          party_address?: string | null
          party_code?: string | null
          party_gst?: string | null
          party_gstin?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          party_snapshot?: Json | null
          payment_method?: string | null
          payment_status?: string | null
          pending_total_qty?: number | null
          pricing_snapshot?: Json | null
          rd_extra?: number | null
          rd_mode?: boolean | null
          ref_no?: string | null
          reference_no?: string | null
          reference_order_number?: string | null
          remarks?: string | null
          round_off?: number | null
          roundoff_amount?: number | null
          salesman?: string | null
          salesman_id?: string | null
          sgst_amount?: number | null
          shipping_address?: string | null
          shipping_charges?: number | null
          source_channel?: string | null
          source_id?: string | null
          source_reference?: string | null
          source_type?: string | null
          split_from?: string | null
          status?: string | null
          subtotal?: number | null
          sync_error?: string | null
          sync_status?: string | null
          tax?: number | null
          tax_snapshot?: Json | null
          taxable_amount?: number | null
          total_amount?: number | null
          total_items?: number | null
          total_qty?: number | null
          transport_charges?: number | null
          transport_name?: string | null
          unloading_charges?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
          vehicle_number?: string | null
          voucher_no?: string | null
          voucher_type?: string | null
        }
        Update: {
          agreed_discount?: number | null
          billing_address?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          cd_total?: number | null
          cgst_amount?: number | null
          child_order_ids?: string[] | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_type?: string | null
          default_discount?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          device_info?: string | null
          discount?: number | null
          discount_amount?: number | null
          discount_mode?: string | null
          discount_total?: number | null
          due_amount?: number | null
          effective_discount?: number | null
          extra_charges?: number | null
          grand_total?: number | null
          gst_number?: string | null
          gst_total?: number | null
          handling_charges?: number | null
          id?: string
          igst_amount?: number | null
          import_batch_id?: string | null
          insurance_charges?: number | null
          is_deleted?: boolean
          is_locked?: boolean
          items_snapshot?: Json | null
          loading_charges?: number | null
          locked_at?: string | null
          locked_by?: string | null
          merged_from?: string[] | null
          metadata?: Json | null
          mode?: string | null
          narration?: string | null
          notes?: string | null
          order_date?: string | null
          order_group_id?: string | null
          order_number?: string
          order_type?: string | null
          packing_charges?: number | null
          paid_amount?: number | null
          parent_order_id?: string | null
          parent_order_ids?: string[] | null
          party_address?: string | null
          party_code?: string | null
          party_gst?: string | null
          party_gstin?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          party_snapshot?: Json | null
          payment_method?: string | null
          payment_status?: string | null
          pending_total_qty?: number | null
          pricing_snapshot?: Json | null
          rd_extra?: number | null
          rd_mode?: boolean | null
          ref_no?: string | null
          reference_no?: string | null
          reference_order_number?: string | null
          remarks?: string | null
          round_off?: number | null
          roundoff_amount?: number | null
          salesman?: string | null
          salesman_id?: string | null
          sgst_amount?: number | null
          shipping_address?: string | null
          shipping_charges?: number | null
          source_channel?: string | null
          source_id?: string | null
          source_reference?: string | null
          source_type?: string | null
          split_from?: string | null
          status?: string | null
          subtotal?: number | null
          sync_error?: string | null
          sync_status?: string | null
          tax?: number | null
          tax_snapshot?: Json | null
          taxable_amount?: number | null
          total_amount?: number | null
          total_items?: number | null
          total_qty?: number | null
          transport_charges?: number | null
          transport_name?: string | null
          unloading_charges?: number | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
          vehicle_number?: string | null
          voucher_no?: string | null
          voucher_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_orders_business"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address: string | null
          agreed_discount: number | null
          allow_credit_orders: boolean | null
          alt_phone: string | null
          auto_approve: boolean | null
          auto_approve_orders: boolean | null
          balance: number | null
          balance_type: string | null
          beat: string | null
          billing_address: string | null
          business_id: string
          business_type: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_cheque_url: string | null
          cancelled_reason: string | null
          cd_percent: number | null
          city: string | null
          composition: boolean
          contact_person: string | null
          country: string | null
          created_at: string | null
          credit_days: number | null
          credit_enabled: boolean | null
          credit_limit: number | null
          credit_score: number | null
          current_balance: number | null
          dealer_network: boolean | null
          default_discount: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_type: string | null
          discount_value: number | null
          district: string | null
          email: string | null
          firm_name: string | null
          gst: string | null
          gst_certificate_url: string | null
          gst_number: string | null
          gstin: string | null
          id: string
          industry_segment: string | null
          interest_pct: number | null
          is_deleted: boolean
          is_locked: boolean
          last_invoice_date: string | null
          last_payment_date: string | null
          ledger_name: string | null
          locked_at: string | null
          locked_by: string | null
          maps_link: string | null
          msme: string | null
          name: string
          network_visibility: boolean | null
          notes: string | null
          online_account_status: string | null
          online_ordering: boolean | null
          online_ordering_access: boolean | null
          opening_balance: number | null
          outstanding_balance: number | null
          pan: string | null
          pan_card_url: string | null
          party_code: string | null
          phone: string | null
          pincode: string | null
          place_of_supply: string | null
          preferred_customer: boolean | null
          preferred_supplier: boolean | null
          pricing_notes: string | null
          rate_category: string | null
          rd_extra: number | null
          rd_percent: number | null
          registration_type: string | null
          segment_id: string | null
          shipping_address: string | null
          special_discount: number | null
          state: string | null
          state_code: string | null
          status: string | null
          trade_license_url: string | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          agreed_discount?: number | null
          allow_credit_orders?: boolean | null
          alt_phone?: string | null
          auto_approve?: boolean | null
          auto_approve_orders?: boolean | null
          balance?: number | null
          balance_type?: string | null
          beat?: string | null
          billing_address?: string | null
          business_id: string
          business_type?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_cheque_url?: string | null
          cancelled_reason?: string | null
          cd_percent?: number | null
          city?: string | null
          composition?: boolean
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          credit_days?: number | null
          credit_enabled?: boolean | null
          credit_limit?: number | null
          credit_score?: number | null
          current_balance?: number | null
          dealer_network?: boolean | null
          default_discount?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          district?: string | null
          email?: string | null
          firm_name?: string | null
          gst?: string | null
          gst_certificate_url?: string | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          industry_segment?: string | null
          interest_pct?: number | null
          is_deleted?: boolean
          is_locked?: boolean
          last_invoice_date?: string | null
          last_payment_date?: string | null
          ledger_name?: string | null
          locked_at?: string | null
          locked_by?: string | null
          maps_link?: string | null
          msme?: string | null
          name: string
          network_visibility?: boolean | null
          notes?: string | null
          online_account_status?: string | null
          online_ordering?: boolean | null
          online_ordering_access?: boolean | null
          opening_balance?: number | null
          outstanding_balance?: number | null
          pan?: string | null
          pan_card_url?: string | null
          party_code?: string | null
          phone?: string | null
          pincode?: string | null
          place_of_supply?: string | null
          preferred_customer?: boolean | null
          preferred_supplier?: boolean | null
          pricing_notes?: string | null
          rate_category?: string | null
          rd_extra?: number | null
          rd_percent?: number | null
          registration_type?: string | null
          segment_id?: string | null
          shipping_address?: string | null
          special_discount?: number | null
          state?: string | null
          state_code?: string | null
          status?: string | null
          trade_license_url?: string | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          agreed_discount?: number | null
          allow_credit_orders?: boolean | null
          alt_phone?: string | null
          auto_approve?: boolean | null
          auto_approve_orders?: boolean | null
          balance?: number | null
          balance_type?: string | null
          beat?: string | null
          billing_address?: string | null
          business_id?: string
          business_type?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_cheque_url?: string | null
          cancelled_reason?: string | null
          cd_percent?: number | null
          city?: string | null
          composition?: boolean
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          credit_days?: number | null
          credit_enabled?: boolean | null
          credit_limit?: number | null
          credit_score?: number | null
          current_balance?: number | null
          dealer_network?: boolean | null
          default_discount?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_type?: string | null
          discount_value?: number | null
          district?: string | null
          email?: string | null
          firm_name?: string | null
          gst?: string | null
          gst_certificate_url?: string | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          industry_segment?: string | null
          interest_pct?: number | null
          is_deleted?: boolean
          is_locked?: boolean
          last_invoice_date?: string | null
          last_payment_date?: string | null
          ledger_name?: string | null
          locked_at?: string | null
          locked_by?: string | null
          maps_link?: string | null
          msme?: string | null
          name?: string
          network_visibility?: boolean | null
          notes?: string | null
          online_account_status?: string | null
          online_ordering?: boolean | null
          online_ordering_access?: boolean | null
          opening_balance?: number | null
          outstanding_balance?: number | null
          pan?: string | null
          pan_card_url?: string | null
          party_code?: string | null
          phone?: string | null
          pincode?: string | null
          place_of_supply?: string | null
          preferred_customer?: boolean | null
          preferred_supplier?: boolean | null
          pricing_notes?: string | null
          rate_category?: string | null
          rd_extra?: number | null
          rd_percent?: number | null
          registration_type?: string | null
          segment_id?: string | null
          shipping_address?: string | null
          special_discount?: number | null
          state?: string | null
          state_code?: string | null
          status?: string | null
          trade_license_url?: string | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_parties_business"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      party_activity_logs: {
        Row: {
          activity_type: string | null
          business_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          party_id: string
        }
        Insert: {
          activity_type?: string | null
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          party_id: string
        }
        Update: {
          activity_type?: string | null
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          party_id?: string
        }
        Relationships: []
      }
      party_discounts: {
        Row: {
          business_id: string | null
          created_at: string | null
          discount: number | null
          id: string
          mode: string | null
          notes: string | null
          party_id: string | null
          segment_id: string | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          discount?: number | null
          id?: string
          mode?: string | null
          notes?: string | null
          party_id?: string | null
          segment_id?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          discount?: number | null
          id?: string
          mode?: string | null
          notes?: string | null
          party_id?: string | null
          segment_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_entries: {
        Row: {
          amount: number | null
          business_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          party_id: string | null
          payment_date: string | null
          payment_mode: string | null
          reference_number: string | null
          remarks: string | null
        }
        Insert: {
          amount?: number | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          party_id?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          remarks?: string | null
        }
        Update: {
          amount?: number | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          party_id?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_entries_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          period_month: number | null
          period_year: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          period_month?: number | null
          period_year?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          period_month?: number | null
          period_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_permissions: {
        Row: {
          id: string
          permission_code: string | null
          portal_user_id: string | null
        }
        Insert: {
          id?: string
          permission_code?: string | null
          portal_user_id?: string | null
        }
        Update: {
          id?: string
          permission_code?: string | null
          portal_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_permissions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "dealer_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_users: {
        Row: {
          business_id: string
          created_at: string
          id: string
          party_id: string
          portal_type: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          party_id: string
          portal_type?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          party_id?: string
          portal_type?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_returns: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          original_invoice_id: string | null
          refund_amount: number | null
          refund_mode: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          original_invoice_id?: string | null
          refund_amount?: number | null
          refund_mode?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          original_invoice_id?: string | null
          refund_amount?: number | null
          refund_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          closed_at: string | null
          id: string
          opened_at: string | null
          terminal_id: string | null
        }
        Insert: {
          closed_at?: string | null
          id?: string
          opened_at?: string | null
          terminal_id?: string | null
        }
        Update: {
          closed_at?: string | null
          id?: string
          opened_at?: string | null
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminals: {
        Row: {
          business_id: string
          id: string
          terminal_name: string
        }
        Insert: {
          business_id: string
          id?: string
          terminal_name: string
        }
        Update: {
          business_id?: string
          id?: string
          terminal_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          business_id: string | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          id: string
          product_id: string | null
        }
        Insert: {
          barcode: string
          id?: string
          product_id?: string | null
        }
        Update: {
          barcode?: string
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          id: string
          price_list_id: string | null
          product_id: string | null
          selling_price: number | null
        }
        Insert: {
          id?: string
          price_list_id?: string | null
          product_id?: string | null
          selling_price?: number | null
        }
        Update: {
          id?: string
          price_list_id?: string | null
          product_id?: string | null
          selling_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          business_id: string
          id: string
          product_id: string | null
          qty: number | null
          status: string | null
        }
        Insert: {
          business_id: string
          id?: string
          product_id?: string | null
          qty?: number | null
          status?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          product_id?: string | null
          qty?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accept_online_orders: boolean | null
          allow_credit_orders: boolean | null
          barcode: string | null
          batch_tracking: boolean | null
          brand: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          category: string | null
          created_at: string | null
          dealer_rate: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          gst_pct: number | null
          gst_percent: number | null
          gst_rate: number | null
          hsn: string | null
          hsn_code: string | null
          hsn_sac: string | null
          id: string
          is_deleted: boolean
          is_exempt: boolean
          is_locked: boolean
          item_name: string | null
          location: string | null
          locked_at: string | null
          locked_by: string | null
          low_stock_threshold: number | null
          min_stock: number | null
          mrp: number | null
          name: string
          notes: string | null
          pan_india_visibility: boolean | null
          part_number: string
          product_name: string | null
          publish_online: boolean | null
          purchase_price: number | null
          rack: string | null
          rate: number | null
          search_vector: unknown
          selling_price: number | null
          serial_tracking: boolean | null
          show_price_online: boolean | null
          show_stock_online: boolean | null
          sku: string | null
          status: string | null
          stock: number | null
          tax_type: string | null
          unit: string | null
          updated_at: string | null
          user_id: string
          vehicle_model: string | null
        }
        Insert: {
          accept_online_orders?: boolean | null
          allow_credit_orders?: boolean | null
          barcode?: string | null
          batch_tracking?: boolean | null
          brand?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category?: string | null
          created_at?: string | null
          dealer_rate?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gst_pct?: number | null
          gst_percent?: number | null
          gst_rate?: number | null
          hsn?: string | null
          hsn_code?: string | null
          hsn_sac?: string | null
          id?: string
          is_deleted?: boolean
          is_exempt?: boolean
          is_locked?: boolean
          item_name?: string | null
          location?: string | null
          locked_at?: string | null
          locked_by?: string | null
          low_stock_threshold?: number | null
          min_stock?: number | null
          mrp?: number | null
          name: string
          notes?: string | null
          pan_india_visibility?: boolean | null
          part_number: string
          product_name?: string | null
          publish_online?: boolean | null
          purchase_price?: number | null
          rack?: string | null
          rate?: number | null
          search_vector?: unknown
          selling_price?: number | null
          serial_tracking?: boolean | null
          show_price_online?: boolean | null
          show_stock_online?: boolean | null
          sku?: string | null
          status?: string | null
          stock?: number | null
          tax_type?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id: string
          vehicle_model?: string | null
        }
        Update: {
          accept_online_orders?: boolean | null
          allow_credit_orders?: boolean | null
          barcode?: string | null
          batch_tracking?: boolean | null
          brand?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category?: string | null
          created_at?: string | null
          dealer_rate?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gst_pct?: number | null
          gst_percent?: number | null
          gst_rate?: number | null
          hsn?: string | null
          hsn_code?: string | null
          hsn_sac?: string | null
          id?: string
          is_deleted?: boolean
          is_exempt?: boolean
          is_locked?: boolean
          item_name?: string | null
          location?: string | null
          locked_at?: string | null
          locked_by?: string | null
          low_stock_threshold?: number | null
          min_stock?: number | null
          mrp?: number | null
          name?: string
          notes?: string | null
          pan_india_visibility?: boolean | null
          part_number?: string
          product_name?: string | null
          publish_online?: boolean | null
          purchase_price?: number | null
          rack?: string | null
          rate?: number | null
          search_vector?: unknown
          selling_price?: number | null
          serial_tracking?: boolean | null
          show_price_online?: boolean | null
          show_stock_online?: boolean | null
          sku?: string | null
          status?: string | null
          stock?: number | null
          tax_type?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_business"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          language: string | null
          mobile: string | null
          terms_accepted: boolean
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          language?: string | null
          mobile?: string | null
          terms_accepted?: boolean
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          mobile?: string | null
          terms_accepted?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      purchase_invoice_items: {
        Row: {
          business_id: string | null
          cess_amount: number
          cgst_amount: number
          cgst_rate: number
          discount_percent: number | null
          gst_percent: number | null
          hsn: string | null
          id: string
          igst_amount: number
          igst_rate: number
          line_total: number | null
          product_id: string | null
          purchase_invoice_id: string | null
          purchase_price: number | null
          quantity: number
          sgst_amount: number
          sgst_rate: number
        }
        Insert: {
          business_id?: string | null
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          discount_percent?: number | null
          gst_percent?: number | null
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          line_total?: number | null
          product_id?: string | null
          purchase_invoice_id?: string | null
          purchase_price?: number | null
          quantity?: number
          sgst_amount?: number
          sgst_rate?: number
        }
        Update: {
          business_id?: string | null
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          discount_percent?: number | null
          gst_percent?: number | null
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          line_total?: number | null
          product_id?: string | null
          purchase_invoice_id?: string | null
          purchase_price?: number | null
          quantity?: number
          sgst_amount?: number
          sgst_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          business_id: string | null
          created_at: string | null
          created_by: string | null
          discount_total: number | null
          grand_total: number | null
          gst_total: number | null
          id: string
          invoice_date: string | null
          invoice_number: string
          notes: string | null
          status: string | null
          subtotal: number | null
          supplier_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_total?: number | null
          grand_total?: number | null
          gst_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number: string
          notes?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_total?: number | null
          grand_total?: number | null
          gst_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          notes?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          description: string
          discount_percent: number
          gst_percent: number
          id: string
          part_number: string
          position: number
          product_id: string | null
          purchase_order_id: string
          qty: number
          rate: number
          status: string
          tax_amount: number
          taxable_amount: number
          total_amount: number
        }
        Insert: {
          description?: string
          discount_percent?: number
          gst_percent?: number
          id?: string
          part_number?: string
          position?: number
          product_id?: string | null
          purchase_order_id: string
          qty?: number
          rate?: number
          status?: string
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
        }
        Update: {
          description?: string
          discount_percent?: number
          gst_percent?: number
          id?: string
          part_number?: string
          position?: number
          product_id?: string | null
          purchase_order_id?: string
          qty?: number
          rate?: number
          status?: string
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string
          created_at: string
          created_by: string
          discount_total: number
          expected_delivery_date: string | null
          grand_total: number
          id: string
          lr_number: string | null
          payment_terms: string | null
          pending_qty: number
          po_date: string
          po_number: string
          received_qty: number
          remarks: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal: number
          supplier_id: string | null
          tax_mode: string
          tax_total: number
          terms_conditions: string | null
          total_qty: number
          transport_mode: string | null
          transport_name: string | null
          updated_at: string
          vehicle_number: string | null
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          created_at?: string
          created_by: string
          discount_total?: number
          expected_delivery_date?: string | null
          grand_total?: number
          id?: string
          lr_number?: string | null
          payment_terms?: string | null
          pending_qty?: number
          po_date?: string
          po_number: string
          received_qty?: number
          remarks?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_mode?: string
          tax_total?: number
          terms_conditions?: string | null
          total_qty?: number
          transport_mode?: string | null
          transport_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          created_at?: string
          created_by?: string
          discount_total?: number
          expected_delivery_date?: string | null
          grand_total?: number
          id?: string
          lr_number?: string | null
          payment_terms?: string | null
          pending_qty?: number
          po_date?: string
          po_number?: string
          received_qty?: number
          remarks?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_mode?: string
          tax_total?: number
          terms_conditions?: string | null
          total_qty?: number
          transport_mode?: string | null
          transport_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          payload: Json | null
          report_name: string | null
          report_period: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          payload?: Json | null
          report_name?: string | null
          report_period?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          payload?: Json | null
          report_name?: string | null
          report_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_app_users: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          party_id: string | null
          username: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          party_id?: string | null
          username?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          party_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_app_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_app_users_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_cart: {
        Row: {
          id: string
          product_id: string | null
          qty: number | null
          retailer_user_id: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          qty?: number | null
          retailer_user_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          qty?: number | null
          retailer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_cart_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_cart_retailer_user_id_fkey"
            columns: ["retailer_user_id"]
            isOneToOne: false
            referencedRelation: "retailer_app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      retailer_orders: {
        Row: {
          business_id: string | null
          id: string
          order_status: string | null
          retailer_id: string | null
          total_amount: number | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          order_status?: string | null
          retailer_id?: string | null
          total_amount?: number | null
        }
        Update: {
          business_id?: string | null
          id?: string
          order_status?: string | null
          retailer_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "retailer_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retailer_orders_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_heads: {
        Row: {
          business_id: string
          id: string
          name: string
          type: string
        }
        Insert: {
          business_id: string
          id?: string
          name: string
          type: string
        }
        Update: {
          business_id?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_heads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_config: {
        Row: {
          approval_required: boolean
          business_id: string
          created_at: string | null
          enable_batch_tracking: boolean
          enable_box_packing: boolean
          enable_case_number: boolean
          enable_dispatch_module: boolean
          enable_eway_details: boolean
          enable_invoice_approval: boolean
          enable_multi_warehouse: boolean
          enable_order_approval: boolean
          enable_packing_slip: boolean
          enable_partial_dispatch: boolean
          enable_sales_order: boolean
          enable_salesman_tracking: boolean
          enable_transport_details: boolean
          freeze_date: string | null
          id: string
          stock_reduction_point: string
          updated_at: string | null
          voucher_lock_enabled: boolean
        }
        Insert: {
          approval_required?: boolean
          business_id: string
          created_at?: string | null
          enable_batch_tracking?: boolean
          enable_box_packing?: boolean
          enable_case_number?: boolean
          enable_dispatch_module?: boolean
          enable_eway_details?: boolean
          enable_invoice_approval?: boolean
          enable_multi_warehouse?: boolean
          enable_order_approval?: boolean
          enable_packing_slip?: boolean
          enable_partial_dispatch?: boolean
          enable_sales_order?: boolean
          enable_salesman_tracking?: boolean
          enable_transport_details?: boolean
          freeze_date?: string | null
          id?: string
          stock_reduction_point?: string
          updated_at?: string | null
          voucher_lock_enabled?: boolean
        }
        Update: {
          approval_required?: boolean
          business_id?: string
          created_at?: string | null
          enable_batch_tracking?: boolean
          enable_box_packing?: boolean
          enable_case_number?: boolean
          enable_dispatch_module?: boolean
          enable_eway_details?: boolean
          enable_invoice_approval?: boolean
          enable_multi_warehouse?: boolean
          enable_order_approval?: boolean
          enable_packing_slip?: boolean
          enable_partial_dispatch?: boolean
          enable_sales_order?: boolean
          enable_salesman_tracking?: boolean
          enable_transport_details?: boolean
          freeze_date?: string | null
          id?: string
          stock_reduction_point?: string
          updated_at?: string | null
          voucher_lock_enabled?: boolean
        }
        Relationships: []
      }
      sales_invoice_items: {
        Row: {
          business_id: string | null
          cess_amount: number
          cgst_amount: number
          cgst_rate: number
          created_at: string | null
          description: string | null
          discount_pct: number | null
          gst_pct: number | null
          hsn: string | null
          id: string
          igst_amount: number
          igst_rate: number
          invoice_id: string
          mrp: number
          net_rate: number
          part_number: string | null
          position: number | null
          product_id: string | null
          qty: number | null
          rate: number | null
          sgst_amount: number
          sgst_rate: number
          total: number | null
          user_id: string
          vehicle_model: string | null
        }
        Insert: {
          business_id?: string | null
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string | null
          description?: string | null
          discount_pct?: number | null
          gst_pct?: number | null
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_id: string
          mrp?: number
          net_rate?: number
          part_number?: string | null
          position?: number | null
          product_id?: string | null
          qty?: number | null
          rate?: number | null
          sgst_amount?: number
          sgst_rate?: number
          total?: number | null
          user_id: string
          vehicle_model?: string | null
        }
        Update: {
          business_id?: string | null
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string | null
          description?: string | null
          discount_pct?: number | null
          gst_pct?: number | null
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_id?: string
          mrp?: number
          net_rate?: number
          part_number?: string | null
          position?: number | null
          product_id?: string | null
          qty?: number | null
          rate?: number | null
          sgst_amount?: number
          sgst_rate?: number
          total?: number | null
          user_id?: string
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          billing_address: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string | null
          customer_type: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_total: number | null
          dispatch_id: string | null
          e_invoice_status: string | null
          eway_bill_no: string | null
          grand_total: number | null
          gst_total: number | null
          id: string
          invoice_category: string | null
          invoice_date: string | null
          invoice_number: string
          invoice_type: string | null
          irn: string | null
          is_deleted: boolean
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          order_id: string | null
          party_id: string | null
          party_name: string | null
          party_snapshot: Json | null
          place_of_supply: string | null
          remarks: string | null
          retail_customer_name: string | null
          retail_mobile: string | null
          reverse_charge: boolean
          salesman: string | null
          shipping_address: string | null
          shipping_charges: number | null
          status: string | null
          subtotal: number | null
          updated_at: string | null
          user_id: string
          voucher_id: string | null
        }
        Insert: {
          billing_address?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string | null
          customer_type?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_total?: number | null
          dispatch_id?: string | null
          e_invoice_status?: string | null
          eway_bill_no?: string | null
          grand_total?: number | null
          gst_total?: number | null
          id?: string
          invoice_category?: string | null
          invoice_date?: string | null
          invoice_number: string
          invoice_type?: string | null
          irn?: string | null
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          order_id?: string | null
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          place_of_supply?: string | null
          remarks?: string | null
          retail_customer_name?: string | null
          retail_mobile?: string | null
          reverse_charge?: boolean
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number | null
          status?: string | null
          subtotal?: number | null
          updated_at?: string | null
          user_id: string
          voucher_id?: string | null
        }
        Update: {
          billing_address?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string | null
          customer_type?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_total?: number | null
          dispatch_id?: string | null
          e_invoice_status?: string | null
          eway_bill_no?: string | null
          grand_total?: number | null
          gst_total?: number | null
          id?: string
          invoice_category?: string | null
          invoice_date?: string | null
          invoice_number?: string
          invoice_type?: string | null
          irn?: string | null
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          order_id?: string | null
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          place_of_supply?: string | null
          remarks?: string | null
          retail_customer_name?: string | null
          retail_mobile?: string | null
          reverse_charge?: boolean
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number | null
          status?: string | null
          subtotal?: number | null
          updated_at?: string | null
          user_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      salesmen: {
        Row: {
          business_id: string | null
          employee_id: string | null
          id: string
          territory: string | null
        }
        Insert: {
          business_id?: string | null
          employee_id?: string | null
          id?: string
          territory?: string | null
        }
        Update: {
          business_id?: string | null
          employee_id?: string | null
          id?: string
          territory?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salesmen_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesmen_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_customers: {
        Row: {
          id: string
          party_id: string | null
          scheme_id: string | null
        }
        Insert: {
          id?: string
          party_id?: string | null
          scheme_id?: string | null
        }
        Update: {
          id?: string
          party_id?: string | null
          scheme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheme_customers_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheme_customers_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_products: {
        Row: {
          id: string
          product_id: string | null
          scheme_id: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          scheme_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          scheme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheme_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheme_products_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      schemes: {
        Row: {
          business_id: string | null
          end_date: string | null
          id: string
          scheme_name: string
          scheme_type: string | null
          start_date: string | null
        }
        Insert: {
          business_id?: string | null
          end_date?: string | null
          id?: string
          scheme_name: string
          scheme_type?: string | null
          start_date?: string | null
        }
        Update: {
          business_id?: string | null
          end_date?: string | null
          id?: string
          scheme_name?: string
          scheme_type?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schemes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          business_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      staff_users: {
        Row: {
          business_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          name: string | null
          owner_id: string
          phone: string | null
          role: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          owner_id: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          owner_id?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string | null
          qty: number
          reference_id: string
          reference_type: string
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          product_id?: string | null
          qty: number
          reference_id: string
          reference_type: string
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string | null
          qty?: number
          reference_id?: string
          reference_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_stock_business"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          business_id: string | null
          from_branch_id: string | null
          id: string
          status: string | null
          to_branch_id: string | null
          transfer_date: string | null
        }
        Insert: {
          business_id?: string | null
          from_branch_id?: string | null
          id?: string
          status?: string | null
          to_branch_id?: string | null
          transfer_date?: string | null
        }
        Update: {
          business_id?: string | null
          from_branch_id?: string | null
          id?: string
          status?: string | null
          to_branch_id?: string | null
          transfer_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          id: string
          plan_name: string
          price: number | null
        }
        Insert: {
          id?: string
          plan_name: string
          price?: number | null
        }
        Update: {
          id?: string
          plan_name?: string
          price?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          business_id: string
          end_date: string | null
          id: string
          plan_id: string | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          business_id: string
          end_date?: string | null
          id?: string
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string
          end_date?: string | null
          id?: string
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          feature_code: string | null
          id: string
          limit_value: number | null
          plan_id: string | null
        }
        Insert: {
          feature_code?: string | null
          id?: string
          limit_value?: number | null
          plan_id?: string | null
        }
        Update: {
          feature_code?: string | null
          id?: string
          limit_value?: number | null
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_limits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_items: {
        Row: {
          amount: number | null
          business_id: string | null
          cr_amount: number
          dr_amount: number
          entry_type: string | null
          id: string
          ledger_account_id: string | null
          narration: string | null
          position: number
          user_id: string | null
          voucher_id: string | null
        }
        Insert: {
          amount?: number | null
          business_id?: string | null
          cr_amount?: number
          dr_amount?: number
          entry_type?: string | null
          id?: string
          ledger_account_id?: string | null
          narration?: string | null
          position?: number
          user_id?: string | null
          voucher_id?: string | null
        }
        Update: {
          amount?: number | null
          business_id?: string | null
          cr_amount?: number
          dr_amount?: number
          entry_type?: string | null
          id?: string
          ledger_account_id?: string | null
          narration?: string | null
          position?: number
          user_id?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_items_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_number_series: {
        Row: {
          branch: string | null
          business_id: string | null
          created_at: string
          fy_start_month: number
          fy_token: string | null
          id: string
          is_default: boolean
          mode: string
          next_number: number
          padding: number
          prefix: string
          reset_yearly: boolean
          series_name: string
          suffix: string
          updated_at: string
          user_id: string
          voucher_type: string
        }
        Insert: {
          branch?: string | null
          business_id?: string | null
          created_at?: string
          fy_start_month?: number
          fy_token?: string | null
          id?: string
          is_default?: boolean
          mode?: string
          next_number?: number
          padding?: number
          prefix?: string
          reset_yearly?: boolean
          series_name?: string
          suffix?: string
          updated_at?: string
          user_id: string
          voucher_type: string
        }
        Update: {
          branch?: string | null
          business_id?: string | null
          created_at?: string
          fy_start_month?: number
          fy_token?: string | null
          id?: string
          is_default?: boolean
          mode?: string
          next_number?: number
          padding?: number
          prefix?: string
          reset_yearly?: boolean
          series_name?: string
          suffix?: string
          updated_at?: string
          user_id?: string
          voucher_type?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string | null
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          narration: string | null
          reference_id: string | null
          reference_type: string | null
          status: string | null
          total_amount: number | null
          updated_at: string
          user_id: string | null
          voucher_date: string | null
          voucher_number: string
          voucher_type: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
          voucher_date?: string | null
          voucher_number: string
          voucher_type: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
          voucher_date?: string | null
          voucher_number?: string
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          business_id: string | null
          created_at: string | null
          id: string
          warehouse_name: string
        }
        Insert: {
          address?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          warehouse_name: string
        }
        Update: {
          address?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          warehouse_name?: string
        }
        Relationships: []
      }
      whatsapp_orders: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          mobile_number: string | null
          order_payload: Json | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          mobile_number?: string | null
          order_payload?: Json | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          mobile_number?: string | null
          order_payload?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          mobile_number: string | null
          session_status: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          mobile_number?: string | null
          session_status?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          mobile_number?: string | null
          session_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      year_closing_entries: {
        Row: {
          business_id: string
          closing_type: string | null
          created_at: string | null
          financial_year_id: string | null
          id: string
          voucher_id: string | null
        }
        Insert: {
          business_id: string
          closing_type?: string | null
          created_at?: string | null
          financial_year_id?: string | null
          id?: string
          voucher_id?: string | null
        }
        Update: {
          business_id?: string
          closing_type?: string | null
          created_at?: string | null
          financial_year_id?: string | null
          id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "year_closing_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "year_closing_entries_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "year_closing_entries_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_sales_summary: {
        Row: {
          business_id: string | null
          sale_date: string | null
          sales_value: number | null
        }
        Relationships: []
      }
      order_fulfillment_summary: {
        Row: {
          dispatched_qty: number | null
          invoiced_qty: number | null
          order_id: string | null
          order_number: string | null
          ordered_qty: number | null
          party_name: string | null
          pending_qty: number | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _user_default_business: { Args: { _user_id: string }; Returns: string }
      approve_dealer_application: {
        Args: { _application_id: string }
        Returns: string
      }
      check_signup_contact_available: {
        Args: { _email: string; _mobile: string }
        Returns: Json
      }
      create_business_with_owner: {
        Args: { _business_data: Json; _business_id: string; _owner_id: string }
        Returns: undefined
      }
      current_business_id: { Args: never; Returns: string }
      ensure_party_ledger: {
        Args: { _business_id?: string; _party_id: string; _user_id: string }
        Returns: string
      }
      get_current_portal_business_id: { Args: never; Returns: string }
      get_current_portal_party_id: { Args: never; Returns: string }
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["business_role"][]
        }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      next_dispatch_number: { Args: { _user_id: string }; Returns: string }
      next_invoice_number: { Args: { _user_id: string }; Returns: string }
      next_order_number: { Args: { _user_id: string }; Returns: string }
      next_packing_slip_number: { Args: { _user_id: string }; Returns: string }
      next_po_number: { Args: { _business_id: string }; Returns: string }
      next_voucher_number: {
        Args: { _user_id: string; _voucher_type: string }
        Returns: string
      }
      pending_approvals_count: {
        Args: { _business_id: string }
        Returns: number
      }
      recalc_po_quantities: { Args: { _po_id: string }; Returns: undefined }
      reject_dealer_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: undefined
      }
      seed_accounting_defaults: {
        Args: { _business_id?: string; _user_id: string }
        Returns: undefined
      }
      submit_dealer_application: {
        Args: {
          _address?: string
          _business_id: string
          _city?: string
          _company_name: string
          _contact_name: string
          _email: string
          _gstin?: string
          _phone: string
          _portal_type?: string
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      approval_action: "edit" | "delete" | "cancel" | "unlock" | "reopen"
      approval_module:
        | "sales_invoice"
        | "dispatch"
        | "order"
        | "voucher"
        | "inventory_adjustment"
        | "party"
        | "product"
      approval_status: "pending" | "approved" | "rejected" | "cancelled"
      business_role:
        | "owner"
        | "admin"
        | "manager"
        | "accountant"
        | "salesman"
        | "store_manager"
        | "staff"
        | "viewer"
      purchase_order_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "ordered"
        | "partially_received"
        | "received"
        | "cancelled"
        | "closed"
        | "rejected"
      voucher_status: "draft" | "posted" | "cancelled"
      voucher_type:
        | "sales"
        | "purchase"
        | "receipt"
        | "payment"
        | "journal"
        | "contra"
        | "credit_note"
        | "debit_note"
        | "opening_balance"
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
    Enums: {
      approval_action: ["edit", "delete", "cancel", "unlock", "reopen"],
      approval_module: [
        "sales_invoice",
        "dispatch",
        "order",
        "voucher",
        "inventory_adjustment",
        "party",
        "product",
      ],
      approval_status: ["pending", "approved", "rejected", "cancelled"],
      business_role: [
        "owner",
        "admin",
        "manager",
        "accountant",
        "salesman",
        "store_manager",
        "staff",
        "viewer",
      ],
      purchase_order_status: [
        "draft",
        "pending_approval",
        "approved",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
        "closed",
        "rejected",
      ],
      voucher_status: ["draft", "posted", "cancelled"],
      voucher_type: [
        "sales",
        "purchase",
        "receipt",
        "payment",
        "journal",
        "contra",
        "credit_note",
        "debit_note",
        "opening_balance",
      ],
    },
  },
} as const
