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
          account_type: string | null
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
          account_type?: string | null
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
          account_type?: string | null
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
      accounting_posting_rules: {
        Row: {
          active: boolean | null
          business_id: string | null
          created_at: string | null
          id: string
          ledger_type: string | null
          posting_name: string | null
          posting_order: number | null
          posting_side: string | null
          transaction_type: string | null
        }
        Insert: {
          active?: boolean | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          ledger_type?: string | null
          posting_name?: string | null
          posting_order?: number | null
          posting_side?: string | null
          transaction_type?: string | null
        }
        Update: {
          active?: boolean | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          ledger_type?: string | null
          posting_name?: string | null
          posting_order?: number | null
          posting_side?: string | null
          transaction_type?: string | null
        }
        Relationships: []
      }
      accounting_settings: {
        Row: {
          allow_negative_stock: boolean
          business_id: string
          date_format: string
          default_place_of_supply: string | null
          enable_einvoice: boolean
          enable_ewaybill: boolean
          financial_note_gst_mode: string
          financial_note_ledger_mode: string
          gst_integration_mode: string
          gst_return_frequency: string
          lock_date: string | null
          locked_at: string | null
          locked_by: string | null
          max_discount_pct: number | null
          minimum_margin_pct: number | null
          permission_mode: string
          pricing_policy: string
          require_hsn_on_invoice: boolean
          share_link_expiry: string
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          business_id: string
          date_format?: string
          default_place_of_supply?: string | null
          enable_einvoice?: boolean
          enable_ewaybill?: boolean
          financial_note_gst_mode?: string
          financial_note_ledger_mode?: string
          gst_integration_mode?: string
          gst_return_frequency?: string
          lock_date?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_discount_pct?: number | null
          minimum_margin_pct?: number | null
          permission_mode?: string
          pricing_policy?: string
          require_hsn_on_invoice?: boolean
          share_link_expiry?: string
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          business_id?: string
          date_format?: string
          default_place_of_supply?: string | null
          enable_einvoice?: boolean
          enable_ewaybill?: boolean
          financial_note_gst_mode?: string
          financial_note_ledger_mode?: string
          gst_integration_mode?: string
          gst_return_frequency?: string
          lock_date?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_discount_pct?: number | null
          minimum_margin_pct?: number | null
          permission_mode?: string
          pricing_policy?: string
          require_hsn_on_invoice?: boolean
          share_link_expiry?: string
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
          {
            foreignKeyName: "ai_purchase_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
          ledger_account_id: string | null
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
          ledger_account_id?: string | null
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
          ledger_account_id?: string | null
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
          {
            foreignKeyName: "bank_accounts_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
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
          {
            foreignKeyName: "bom_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
          {
            foreignKeyName: "bom_master_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
      business_gst_registrations: {
        Row: {
          business_id: string
          created_at: string
          gstin: string
          id: string
          is_primary: boolean
          lut_bond_number: string | null
          registration_type: string
          state_code: string | null
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          gstin: string
          id?: string
          is_primary?: boolean
          lut_bond_number?: string | null
          registration_type?: string
          state_code?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          gstin?: string
          id?: string
          is_primary?: boolean
          lut_bond_number?: string | null
          registration_type?: string
          state_code?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_gst_registrations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      business_user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          allow_desktop_login: boolean
          allow_mobile_login: boolean
          business_id: string
          department: string | null
          email: string | null
          expires_at: string
          full_name: string | null
          id: string
          invited_at: string
          invited_by: string
          last_sent_at: string
          login_enabled: boolean
          mobile: string | null
          notes: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          allow_desktop_login?: boolean
          allow_mobile_login?: boolean
          business_id: string
          department?: string | null
          email?: string | null
          expires_at: string
          full_name?: string | null
          id?: string
          invited_at?: string
          invited_by: string
          last_sent_at?: string
          login_enabled?: boolean
          mobile?: string | null
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          allow_desktop_login?: boolean
          allow_mobile_login?: boolean
          business_id?: string
          department?: string | null
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string
          last_sent_at?: string
          login_enabled?: boolean
          mobile?: string | null
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_user_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_users: {
        Row: {
          allow_desktop_login: boolean
          allow_mobile_login: boolean
          allowed_days: string[] | null
          business_id: string | null
          created_at: string | null
          dashboard_focus: string | null
          department: string | null
          email: string | null
          financial_rights: Json
          full_name: string | null
          id: string
          login_enabled: boolean
          max_devices: number | null
          mobile: string | null
          notes: string | null
          office_hours_end: string | null
          office_hours_start: string | null
          office_only_login: boolean
          onboarded_via: string | null
          registered_device_only: boolean
          require_2fa: boolean
          require_password_change: boolean
          role: string | null
          single_session_only: boolean
          status: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          allow_desktop_login?: boolean
          allow_mobile_login?: boolean
          allowed_days?: string[] | null
          business_id?: string | null
          created_at?: string | null
          dashboard_focus?: string | null
          department?: string | null
          email?: string | null
          financial_rights?: Json
          full_name?: string | null
          id?: string
          login_enabled?: boolean
          max_devices?: number | null
          mobile?: string | null
          notes?: string | null
          office_hours_end?: string | null
          office_hours_start?: string | null
          office_only_login?: boolean
          onboarded_via?: string | null
          registered_device_only?: boolean
          require_2fa?: boolean
          require_password_change?: boolean
          role?: string | null
          single_session_only?: boolean
          status?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          allow_desktop_login?: boolean
          allow_mobile_login?: boolean
          allowed_days?: string[] | null
          business_id?: string | null
          created_at?: string | null
          dashboard_focus?: string | null
          department?: string | null
          email?: string | null
          financial_rights?: Json
          full_name?: string | null
          id?: string
          login_enabled?: boolean
          max_devices?: number | null
          mobile?: string | null
          notes?: string | null
          office_hours_end?: string | null
          office_hours_start?: string | null
          office_only_login?: boolean
          onboarded_via?: string | null
          registered_device_only?: boolean
          require_2fa?: boolean
          require_password_change?: boolean
          role?: string | null
          single_session_only?: boolean
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
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
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
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          district: string | null
          email: string | null
          firm_name: string | null
          fy_start_month: number | null
          gst_enabled: boolean | null
          gst_number: string | null
          id: string
          industry_segment: string | null
          invoice_prefix: string | null
          invoice_terms: string | null
          is_deleted: boolean
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
          updated_by: string | null
          version: number
          website: string | null
        }
        Insert: {
          address?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
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
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          email?: string | null
          firm_name?: string | null
          fy_start_month?: number | null
          gst_enabled?: boolean | null
          gst_number?: string | null
          id?: string
          industry_segment?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          is_deleted?: boolean
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
          updated_by?: string | null
          version?: number
          website?: string | null
        }
        Update: {
          address?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
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
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          district?: string | null
          email?: string | null
          firm_name?: string | null
          fy_start_month?: number | null
          gst_enabled?: boolean | null
          gst_number?: string | null
          id?: string
          industry_segment?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          is_deleted?: boolean
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
          updated_by?: string | null
          version?: number
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
      company_audit_logs: {
        Row: {
          action: string
          business_id: string
          changed_fields: Json | null
          created_at: string
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          business_id: string
          changed_fields?: Json | null
          created_at?: string
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          business_id?: string
          changed_fields?: Json | null
          created_at?: string
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      company_delete_requests: {
        Row: {
          business_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          eligible_at: string
          executed_at: string | null
          executed_by: string | null
          id: string
          reason: string | null
          requested_at: string
          requested_by: string
          status: string
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          eligible_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          requested_by: string
          status?: string
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          eligible_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_delete_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
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
      dispatch_item_batches: {
        Row: {
          batch_id: string
          business_id: string
          created_at: string
          dispatch_item_id: string
          id: string
          qty: number
        }
        Insert: {
          batch_id: string
          business_id: string
          created_at?: string
          dispatch_item_id: string
          id?: string
          qty?: number
        }
        Update: {
          batch_id?: string
          business_id?: string
          created_at?: string
          dispatch_item_id?: string
          id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_item_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_item_batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_item_batches_dispatch_item_id_fkey"
            columns: ["dispatch_item_id"]
            isOneToOne: false
            referencedRelation: "dispatch_items"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_item_serials: {
        Row: {
          business_id: string
          created_at: string
          dispatch_item_id: string
          id: string
          serial_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          dispatch_item_id: string
          id?: string
          serial_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          dispatch_item_id?: string
          id?: string
          serial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_item_serials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_item_serials_dispatch_item_id_fkey"
            columns: ["dispatch_item_id"]
            isOneToOne: false
            referencedRelation: "dispatch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_item_serials_serial_id_fkey"
            columns: ["serial_id"]
            isOneToOne: true
            referencedRelation: "product_serials"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_items: {
        Row: {
          bin_id: string | null
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
          stock_dispatched_qty: number | null
          total: number | null
          unit_id: string | null
          user_id: string | null
        }
        Insert: {
          bin_id?: string | null
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
          stock_dispatched_qty?: number | null
          total?: number | null
          unit_id?: string | null
          user_id?: string | null
        }
        Update: {
          bin_id?: string | null
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
          stock_dispatched_qty?: number | null
          total?: number | null
          unit_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "dispatch_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "dispatch_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          created_by: string | null
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
          shipment_status: string
          status: string | null
          tracking_number: string | null
          transport_name: string | null
          transporter: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
          vehicle_number: string | null
          warehouse_id: string | null
        }
        Insert: {
          box_count?: number | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          case_count?: number | null
          created_at?: string | null
          created_by?: string | null
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
          shipment_status?: string
          status?: string | null
          tracking_number?: string | null
          transport_name?: string | null
          transporter?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
          vehicle_number?: string | null
          warehouse_id?: string | null
        }
        Update: {
          box_count?: number | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          case_count?: number | null
          created_at?: string | null
          created_by?: string | null
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
          shipment_status?: string
          status?: string | null
          tracking_number?: string | null
          transport_name?: string | null
          transporter?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
          vehicle_number?: string | null
          warehouse_id?: string | null
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
          {
            foreignKeyName: "dispatches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_share_links: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          storage_path: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          storage_path: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_share_links_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      einvoice_records: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          api_request_id: string | null
          api_response: Json | null
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          invoice_id: string
          irn: string | null
          last_sync_attempt: string | null
          signed_invoice: string | null
          signed_qr_code: string | null
          status: string
          sync_error: string | null
          synced_at: string | null
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string | null
          api_request_id?: string | null
          api_response?: Json | null
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          irn?: string | null
          last_sync_attempt?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          status?: string
          sync_error?: string | null
          synced_at?: string | null
        }
        Update: {
          ack_date?: string | null
          ack_no?: string | null
          api_request_id?: string | null
          api_response?: Json | null
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          irn?: string | null
          last_sync_attempt?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          status?: string
          sync_error?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      ewaybill_records: {
        Row: {
          api_request_id: string | null
          api_response: Json | null
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          distance_km: number | null
          eway_bill_no: string | null
          id: string
          invoice_id: string
          last_sync_attempt: string | null
          status: string
          sync_error: string | null
          synced_at: string | null
          valid_until: string | null
          vehicle_number: string | null
        }
        Insert: {
          api_request_id?: string | null
          api_response?: Json | null
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          distance_km?: number | null
          eway_bill_no?: string | null
          id?: string
          invoice_id: string
          last_sync_attempt?: string | null
          status?: string
          sync_error?: string | null
          synced_at?: string | null
          valid_until?: string | null
          vehicle_number?: string | null
        }
        Update: {
          api_request_id?: string | null
          api_response?: Json | null
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          distance_km?: number | null
          eway_bill_no?: string | null
          id?: string
          invoice_id?: string
          last_sync_attempt?: string | null
          status?: string
          sync_error?: string | null
          synced_at?: string | null
          valid_until?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewaybill_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
          {
            foreignKeyName: "forecast_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      goods_receipt_item_batches: {
        Row: {
          batch_id: string
          business_id: string
          created_at: string
          goods_receipt_item_id: string
          id: string
          qty: number
        }
        Insert: {
          batch_id: string
          business_id: string
          created_at?: string
          goods_receipt_item_id: string
          id?: string
          qty?: number
        }
        Update: {
          batch_id?: string
          business_id?: string
          created_at?: string
          goods_receipt_item_id?: string
          id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_item_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_item_batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_item_batches_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_item_serials: {
        Row: {
          business_id: string
          created_at: string
          goods_receipt_item_id: string
          id: string
          serial_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          goods_receipt_item_id: string
          id?: string
          serial_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          goods_receipt_item_id?: string
          id?: string
          serial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_item_serials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_item_serials_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_item_serials_serial_id_fkey"
            columns: ["serial_id"]
            isOneToOne: true
            referencedRelation: "product_serials"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          accepted_qty: number
          bin_id: string | null
          created_at: string
          damaged_qty: number
          excess_qty: number
          goods_receipt_id: string
          id: string
          ordered_qty: number
          pending_qty: number
          product_id: string
          purchase_order_item_id: string | null
          qc_reason_category: string | null
          qc_reviewed_at: string | null
          qc_status: string
          quality_remarks: string | null
          received_qty: number
          short_qty: number
          stock_accepted_qty: number | null
          unit_id: string | null
        }
        Insert: {
          accepted_qty?: number
          bin_id?: string | null
          created_at?: string
          damaged_qty?: number
          excess_qty?: number
          goods_receipt_id: string
          id?: string
          ordered_qty?: number
          pending_qty?: number
          product_id: string
          purchase_order_item_id?: string | null
          qc_reason_category?: string | null
          qc_reviewed_at?: string | null
          qc_status?: string
          quality_remarks?: string | null
          received_qty?: number
          short_qty?: number
          stock_accepted_qty?: number | null
          unit_id?: string | null
        }
        Update: {
          accepted_qty?: number
          bin_id?: string | null
          created_at?: string
          damaged_qty?: number
          excess_qty?: number
          goods_receipt_id?: string
          id?: string
          ordered_qty?: number
          pending_qty?: number
          product_id?: string
          purchase_order_item_id?: string | null
          qc_reason_category?: string | null
          qc_reviewed_at?: string | null
          qc_status?: string
          quality_remarks?: string | null
          received_qty?: number
          short_qty?: number
          stock_accepted_qty?: number | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_activity_logs: {
        Row: {
          action: string
          created_at: string
          description: string | null
          goods_receipt_id: string
          id: string
          new_data: Json | null
          old_data: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          goods_receipt_id: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          goods_receipt_id?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      gst_2b_import_lines: {
        Row: {
          business_id: string
          cess: number
          cgst: number
          document_date: string | null
          document_number: string
          id: string
          igst: number
          imported_at: string
          imported_by: string | null
          itc_eligible: boolean
          period_month: number | null
          period_year: number | null
          raw: Json | null
          sgst: number
          source: string
          supplier_gstin: string | null
          supplier_name: string | null
          taxable_value: number
        }
        Insert: {
          business_id: string
          cess?: number
          cgst?: number
          document_date?: string | null
          document_number: string
          id?: string
          igst?: number
          imported_at?: string
          imported_by?: string | null
          itc_eligible?: boolean
          period_month?: number | null
          period_year?: number | null
          raw?: Json | null
          sgst?: number
          source?: string
          supplier_gstin?: string | null
          supplier_name?: string | null
          taxable_value?: number
        }
        Update: {
          business_id?: string
          cess?: number
          cgst?: number
          document_date?: string | null
          document_number?: string
          id?: string
          igst?: number
          imported_at?: string
          imported_by?: string | null
          itc_eligible?: boolean
          period_month?: number | null
          period_year?: number | null
          raw?: Json | null
          sgst?: number
          source?: string
          supplier_gstin?: string | null
          supplier_name?: string | null
          taxable_value?: number
        }
        Relationships: []
      }
      gst_financial_year_locks: {
        Row: {
          business_id: string
          fy_start_year: number
          id: string
          locked: boolean
          locked_at: string
          locked_by: string | null
          remarks: string | null
          unlocked_at: string | null
          unlocked_by: string | null
        }
        Insert: {
          business_id: string
          fy_start_year: number
          id?: string
          locked?: boolean
          locked_at?: string
          locked_by?: string | null
          remarks?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
        }
        Update: {
          business_id?: string
          fy_start_year?: number
          id?: string
          locked?: boolean
          locked_at?: string
          locked_by?: string | null
          remarks?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
        }
        Relationships: []
      }
      gst_itc_reversals: {
        Row: {
          business_id: string
          created_at: string
          id: string
          party_id: string | null
          period_month: number
          period_year: number
          remarks: string | null
          reversed_amount: number
          rule: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          party_id?: string | null
          period_month: number
          period_year: number
          remarks?: string | null
          reversed_amount?: number
          rule: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          party_id?: string | null
          period_month?: number
          period_year?: number
          remarks?: string | null
          reversed_amount?: number
          rule?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_itc_reversals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gst_itc_reversals_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_rates: {
        Row: {
          cess_rate: number
          created_at: string
          effective_from: string
          effective_to: string | null
          hsn_code: string | null
          id: string
          rate: number
        }
        Insert: {
          cess_rate?: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          hsn_code?: string | null
          id?: string
          rate: number
        }
        Update: {
          cess_rate?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          hsn_code?: string | null
          id?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "gst_rates_hsn_code_fkey"
            columns: ["hsn_code"]
            isOneToOne: false
            referencedRelation: "hsn_master"
            referencedColumns: ["hsn_code"]
          },
        ]
      }
      gst_return_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approver_role: string
          created_at: string
          id: string
          remarks: string | null
          return_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approver_role: string
          created_at?: string
          id?: string
          remarks?: string | null
          return_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approver_role?: string
          created_at?: string
          id?: string
          remarks?: string | null
          return_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_approvals_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "gst_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_line_items: {
        Row: {
          cess: number
          cgst: number
          created_at: string
          gstr_table: string
          id: string
          igst: number
          invoice_id: string | null
          return_id: string
          sgst: number
          taxable_value: number
          voucher_id: string | null
        }
        Insert: {
          cess?: number
          cgst?: number
          created_at?: string
          gstr_table: string
          id?: string
          igst?: number
          invoice_id?: string | null
          return_id: string
          sgst?: number
          taxable_value?: number
          voucher_id?: string | null
        }
        Update: {
          cess?: number
          cgst?: number
          created_at?: string
          gstr_table?: string
          id?: string
          igst?: number
          invoice_id?: string | null
          return_id?: string
          sgst?: number
          taxable_value?: number
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_line_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "gst_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gst_return_line_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_period_lock_history: {
        Row: {
          action: string
          created_at: string
          id: string
          performed_by: string | null
          period_id: string
          remarks: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          performed_by?: string | null
          period_id: string
          remarks?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          performed_by?: string | null
          period_id?: string
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_period_lock_history_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "gst_return_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_periods: {
        Row: {
          business_id: string
          created_at: string
          id: string
          lock_status: string
          locked_at: string | null
          locked_by: string | null
          period_month: number
          period_year: number
          registration_id: string
          return_type: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          lock_status?: string
          locked_at?: string | null
          locked_by?: string | null
          period_month: number
          period_year: number
          registration_id: string
          return_type: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          lock_status?: string
          locked_at?: string | null
          locked_by?: string | null
          period_month?: number
          period_year?: number
          registration_id?: string
          return_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_return_periods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gst_return_periods_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "business_gst_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_returns: {
        Row: {
          arn: string | null
          created_at: string
          created_by: string | null
          filed_at: string | null
          filed_by: string | null
          govt_schema_version: string | null
          id: string
          json_payload: Json | null
          period_id: string
          signature_ref: string | null
          signed_at: string | null
          signed_by: string | null
          status: string
          version: number
        }
        Insert: {
          arn?: string | null
          created_at?: string
          created_by?: string | null
          filed_at?: string | null
          filed_by?: string | null
          govt_schema_version?: string | null
          id?: string
          json_payload?: Json | null
          period_id: string
          signature_ref?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          version?: number
        }
        Update: {
          arn?: string | null
          created_at?: string
          created_by?: string | null
          filed_at?: string | null
          filed_by?: string | null
          govt_schema_version?: string | null
          id?: string
          json_payload?: Json | null
          period_id?: string
          signature_ref?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "gst_returns_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "gst_return_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      hsn_master: {
        Row: {
          created_at: string
          default_uqc: string | null
          description: string | null
          hsn_code: string
          is_service: boolean
          remarks: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_uqc?: string | null
          description?: string | null
          hsn_code: string
          is_service?: boolean
          remarks?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_uqc?: string | null
          description?: string | null
          hsn_code?: string
          is_service?: boolean
          remarks?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
          adjustment_number: string | null
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
          unit_cost: number | null
          user_id: string
          value_impact: number | null
          voucher_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          adjustment_number?: string | null
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
          unit_cost?: number | null
          user_id: string
          value_impact?: number | null
          voucher_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          adjustment_number?: string | null
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
          unit_cost?: number | null
          user_id?: string
          value_impact?: number | null
          voucher_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_adjustments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          {
            foreignKeyName: "inventory_cost_layers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
          bin_id: string | null
          business_id: string | null
          created_at: string
          id: string
          movement_date: string | null
          movement_reason: string | null
          movement_type: string
          notes: string | null
          party_id: string | null
          party_name: string | null
          product_id: string
          qty: number
          rate: number | null
          reference_id: string | null
          reference_type: string | null
          remarks: string | null
          stock_after: number
          stock_before: number
          unit_id: string | null
          user_id: string
          value: number | null
          voucher_number: string | null
          warehouse_id: string | null
        }
        Insert: {
          bin_id?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          movement_date?: string | null
          movement_reason?: string | null
          movement_type: string
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          product_id: string
          qty: number
          rate?: number | null
          reference_id?: string | null
          reference_type?: string | null
          remarks?: string | null
          stock_after?: number
          stock_before?: number
          unit_id?: string | null
          user_id: string
          value?: number | null
          voucher_number?: string | null
          warehouse_id?: string | null
        }
        Update: {
          bin_id?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          movement_date?: string | null
          movement_reason?: string | null
          movement_type?: string
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          product_id?: string
          qty?: number
          rate?: number | null
          reference_id?: string | null
          reference_type?: string | null
          remarks?: string | null
          stock_after?: number
          stock_before?: number
          unit_id?: string | null
          user_id?: string
          value?: number | null
          voucher_number?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "inventory_movements_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "inventory_valuation_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_type: string | null
          address: string | null
          bank_account_number: string | null
          bank_name: string | null
          business_id: string | null
          city: string | null
          country: string | null
          created_at: string | null
          credit_days: number | null
          credit_limit: number | null
          current_balance: number | null
          email: string | null
          group_id: string | null
          gst_applicable: boolean | null
          gstin: string | null
          id: string
          ifsc_code: string | null
          is_reconcilable: boolean | null
          is_system: boolean | null
          ledger_code: string | null
          ledger_type: string | null
          name: string
          notes: string | null
          opening_balance: number | null
          opening_balance_type: string
          pan: string | null
          parent_account_id: string | null
          party_id: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_type?: string | null
          address?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          business_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          current_balance?: number | null
          email?: string | null
          group_id?: string | null
          gst_applicable?: boolean | null
          gstin?: string | null
          id?: string
          ifsc_code?: string | null
          is_reconcilable?: boolean | null
          is_system?: boolean | null
          ledger_code?: string | null
          ledger_type?: string | null
          name: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_type?: string
          pan?: string | null
          parent_account_id?: string | null
          party_id?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_type?: string | null
          address?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          business_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          current_balance?: number | null
          email?: string | null
          group_id?: string | null
          gst_applicable?: boolean | null
          gstin?: string | null
          id?: string
          ifsc_code?: string | null
          is_reconcilable?: boolean | null
          is_system?: boolean | null
          ledger_code?: string | null
          ledger_type?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_type?: string
          pan?: string | null
          parent_account_id?: string | null
          party_id?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
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
          branch_id: string | null
          business_id: string | null
          cost_center_id: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string | null
          entry_side: string | null
          entry_type: string
          financial_year_id: string | null
          id: string
          is_reversed: boolean | null
          ledger_account_id: string | null
          narration: string | null
          reference_id: string | null
          reference_type: string | null
          reversal_entry_id: string | null
          voucher_id: string | null
          voucher_no: string | null
          voucher_type: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          business_id?: string | null
          cost_center_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          entry_side?: string | null
          entry_type: string
          financial_year_id?: string | null
          id?: string
          is_reversed?: boolean | null
          ledger_account_id?: string | null
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_entry_id?: string | null
          voucher_id?: string | null
          voucher_no?: string | null
          voucher_type?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          business_id?: string | null
          cost_center_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          entry_side?: string | null
          entry_type?: string
          financial_year_id?: string | null
          id?: string
          is_reversed?: boolean | null
          ledger_account_id?: string | null
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_entry_id?: string | null
          voucher_id?: string | null
          voucher_no?: string | null
          voucher_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ledger_entries_ledger"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "marketplace_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
      measurement_categories: {
        Row: {
          base_unit_id: string | null
          business_id: string | null
          code: string
          created_at: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          base_unit_id?: string | null
          business_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          base_unit_id?: string | null
          business_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_categories_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      note_adjustment_categories: {
        Row: {
          affects_profit_loss: boolean
          allow_ledger_override: boolean
          business_id: string
          category_name: string
          code: string
          created_at: string
          created_by: string | null
          credit_default_ledger_id: string | null
          debit_default_ledger_id: string | null
          default_gst_rate: number | null
          default_narration: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          display_order: number
          gst_applicable: boolean
          id: string
          is_active: boolean
          is_deleted: boolean
          system_category: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          affects_profit_loss?: boolean
          allow_ledger_override?: boolean
          business_id: string
          category_name: string
          code: string
          created_at?: string
          created_by?: string | null
          credit_default_ledger_id?: string | null
          debit_default_ledger_id?: string | null
          default_gst_rate?: number | null
          default_narration?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number
          gst_applicable?: boolean
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          system_category?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          affects_profit_loss?: boolean
          allow_ledger_override?: boolean
          business_id?: string
          category_name?: string
          code?: string
          created_at?: string
          created_by?: string | null
          credit_default_ledger_id?: string | null
          debit_default_ledger_id?: string | null
          default_gst_rate?: number | null
          default_narration?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number
          gst_applicable?: boolean
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          system_category?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_adjustment_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_adjustment_categories_credit_default_ledger_id_fkey"
            columns: ["credit_default_ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_adjustment_categories_debit_default_ledger_id_fkey"
            columns: ["debit_default_ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
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
      opening_stock_entries: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          financial_year: string
          id: string
          opening_date: string
          product_id: string
          qty: number
          rate: number | null
          value: number | null
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          financial_year: string
          id?: string
          opening_date: string
          product_id: string
          qty?: number
          rate?: number | null
          value?: number | null
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          financial_year?: string
          id?: string
          opening_date?: string
          product_id?: string
          qty?: number
          rate?: number | null
          value?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_stock_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "opening_stock_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          stock_qty: number | null
          taxable_amount: number | null
          total: number | null
          unit_id: string | null
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
          stock_qty?: number | null
          taxable_amount?: number | null
          total?: number | null
          unit_id?: string | null
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
          stock_qty?: number | null
          taxable_amount?: number | null
          total?: number | null
          unit_id?: string | null
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
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          due_date: string | null
          effective_discount: number | null
          extra_charges: number | null
          grand_total: number | null
          gst_number: string | null
          gst_total: number | null
          handling_charges: number | null
          hold_at: string | null
          hold_by: string | null
          hold_reason: string | null
          id: string
          igst_amount: number | null
          import_batch_id: string | null
          insurance_charges: number | null
          is_deleted: boolean
          is_locked: boolean
          items_snapshot: Json | null
          last_activity: string | null
          loading_charges: number | null
          locked_at: string | null
          locked_by: string | null
          merged_from: string[] | null
          metadata: Json | null
          mode: string | null
          narration: string | null
          notes: string | null
          on_hold: boolean
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
          pending_reason: string | null
          pending_total_qty: number | null
          pricing_snapshot: Json | null
          priority: string
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
          warehouse_id: string | null
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
          due_date?: string | null
          effective_discount?: number | null
          extra_charges?: number | null
          grand_total?: number | null
          gst_number?: string | null
          gst_total?: number | null
          handling_charges?: number | null
          hold_at?: string | null
          hold_by?: string | null
          hold_reason?: string | null
          id?: string
          igst_amount?: number | null
          import_batch_id?: string | null
          insurance_charges?: number | null
          is_deleted?: boolean
          is_locked?: boolean
          items_snapshot?: Json | null
          last_activity?: string | null
          loading_charges?: number | null
          locked_at?: string | null
          locked_by?: string | null
          merged_from?: string[] | null
          metadata?: Json | null
          mode?: string | null
          narration?: string | null
          notes?: string | null
          on_hold?: boolean
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
          pending_reason?: string | null
          pending_total_qty?: number | null
          pricing_snapshot?: Json | null
          priority?: string
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
          warehouse_id?: string | null
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
          due_date?: string | null
          effective_discount?: number | null
          extra_charges?: number | null
          grand_total?: number | null
          gst_number?: string | null
          gst_total?: number | null
          handling_charges?: number | null
          hold_at?: string | null
          hold_by?: string | null
          hold_reason?: string | null
          id?: string
          igst_amount?: number | null
          import_batch_id?: string | null
          insurance_charges?: number | null
          is_deleted?: boolean
          is_locked?: boolean
          items_snapshot?: Json | null
          last_activity?: string | null
          loading_charges?: number | null
          locked_at?: string | null
          locked_by?: string | null
          merged_from?: string[] | null
          metadata?: Json | null
          mode?: string | null
          narration?: string | null
          notes?: string | null
          on_hold?: boolean
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
          pending_reason?: string | null
          pending_total_qty?: number | null
          pricing_snapshot?: Json | null
          priority?: string
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
          warehouse_id?: string | null
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
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      output_profiles: {
        Row: {
          business_id: string
          copy_labels: string[]
          created_at: string
          destination: string
          destination_target: string | null
          document_type_id: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
          template_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          copy_labels?: string[]
          created_at?: string
          destination?: string
          destination_target?: string | null
          document_type_id: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          copy_labels?: string[]
          created_at?: string
          destination?: string
          destination_target?: string | null
          document_type_id?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_hierarchy: {
        Row: {
          business_id: string | null
          child_unit_id: string
          created_at: string
          id: string
          parent_unit_id: string
          product_id: string | null
          quantity: number
        }
        Insert: {
          business_id?: string | null
          child_unit_id: string
          created_at?: string
          id?: string
          parent_unit_id: string
          product_id?: string | null
          quantity: number
        }
        Update: {
          business_id?: string | null
          child_unit_id?: string
          created_at?: string
          id?: string
          parent_unit_id?: string
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "packaging_hierarchy_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_hierarchy_child_unit_id_fkey"
            columns: ["child_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_hierarchy_parent_unit_id_fkey"
            columns: ["parent_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_hierarchy_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_hierarchy_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
          party_group_id: string | null
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
          use_group_defaults: boolean
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
          party_group_id?: string | null
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
          use_group_defaults?: boolean
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
          party_group_id?: string | null
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
          use_group_defaults?: boolean
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
          {
            foreignKeyName: "parties_party_group_id_fkey"
            columns: ["party_group_id"]
            isOneToOne: false
            referencedRelation: "party_groups"
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
      party_advance_allocations: {
        Row: {
          adjusted_amount: number
          adjusted_at: string
          advance_id: string
          created_by: string | null
          id: string
          invoice_id: string
          payment_voucher_id: string | null
        }
        Insert: {
          adjusted_amount: number
          adjusted_at?: string
          advance_id: string
          created_by?: string | null
          id?: string
          invoice_id: string
          payment_voucher_id?: string | null
        }
        Update: {
          adjusted_amount?: number
          adjusted_at?: string
          advance_id?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          payment_voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_advance_allocations_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "party_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_advance_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_advance_allocations_payment_voucher_id_fkey"
            columns: ["payment_voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      party_advances: {
        Row: {
          available_amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          original_amount: number
          party_id: string
          source_type: string
          status: string
          used_amount: number
          voucher_id: string | null
        }
        Insert: {
          available_amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          original_amount: number
          party_id: string
          source_type?: string
          status?: string
          used_amount?: number
          voucher_id?: string | null
        }
        Update: {
          available_amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          original_amount?: number
          party_id?: string
          source_type?: string
          status?: string
          used_amount?: number
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_advances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_advances_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_advances_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      party_balance_summary: {
        Row: {
          business_id: string
          current_balance: number
          last_voucher_at: string | null
          party_id: string
          total_cr: number
          total_dr: number
          updated_at: string
        }
        Insert: {
          business_id: string
          current_balance?: number
          last_voucher_at?: string | null
          party_id: string
          total_cr?: number
          total_dr?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          current_balance?: number
          last_voucher_at?: string | null
          party_id?: string
          total_cr?: number
          total_dr?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_balance_summary_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_balance_summary_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_discount_profiles: {
        Row: {
          business_id: string
          cd_pct: number
          created_at: string
          discount_mode: string
          effective_from: string | null
          effective_to: string | null
          extra_pct: number
          id: string
          is_active: boolean
          party_id: string
          priority: number
          rd_pct: number
          scheme_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cd_pct?: number
          created_at?: string
          discount_mode?: string
          effective_from?: string | null
          effective_to?: string | null
          extra_pct?: number
          id?: string
          is_active?: boolean
          party_id: string
          priority?: number
          rd_pct?: number
          scheme_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cd_pct?: number
          created_at?: string
          discount_mode?: string
          effective_from?: string | null
          effective_to?: string | null
          extra_pct?: number
          id?: string
          is_active?: boolean
          party_id?: string
          priority?: number
          rd_pct?: number
          scheme_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_discount_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_discount_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
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
      party_groups: {
        Row: {
          allow_invoice_download: boolean
          allow_ledger: boolean
          allow_online_order: boolean
          allow_outstanding: boolean
          allow_payment: boolean
          allow_scheme_visibility: boolean
          allow_stock_visibility: boolean
          approval_required: boolean
          auto_debit_note: boolean
          auto_interest: boolean
          beat: string | null
          business_id: string
          collection_priority: string
          created_at: string
          default_cd_pct: number | null
          default_credit_days: number | null
          default_credit_limit: number | null
          default_discount_mode: string
          default_price_level: string | null
          default_price_list_id: string | null
          default_rd_pct: number | null
          default_salesman_id: string | null
          default_salesman_name: string | null
          default_scheme_id: string | null
          default_transport: string | null
          default_warehouse_id: string | null
          freight_rule: string | null
          grace_days: number
          group_code: string | null
          gst_type_default: string | null
          id: string
          interest_pct: number
          is_active: boolean
          is_system: boolean
          ledger_group_id: string | null
          margin_rule_pct: number | null
          name: string
          override_allowed: boolean
          parent_id: string | null
          payment_terms: string | null
          reminder_schedule: string | null
          route: string | null
          stop_supply_rule: string
          territory: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          allow_invoice_download?: boolean
          allow_ledger?: boolean
          allow_online_order?: boolean
          allow_outstanding?: boolean
          allow_payment?: boolean
          allow_scheme_visibility?: boolean
          allow_stock_visibility?: boolean
          approval_required?: boolean
          auto_debit_note?: boolean
          auto_interest?: boolean
          beat?: string | null
          business_id: string
          collection_priority?: string
          created_at?: string
          default_cd_pct?: number | null
          default_credit_days?: number | null
          default_credit_limit?: number | null
          default_discount_mode?: string
          default_price_level?: string | null
          default_price_list_id?: string | null
          default_rd_pct?: number | null
          default_salesman_id?: string | null
          default_salesman_name?: string | null
          default_scheme_id?: string | null
          default_transport?: string | null
          default_warehouse_id?: string | null
          freight_rule?: string | null
          grace_days?: number
          group_code?: string | null
          gst_type_default?: string | null
          id?: string
          interest_pct?: number
          is_active?: boolean
          is_system?: boolean
          ledger_group_id?: string | null
          margin_rule_pct?: number | null
          name: string
          override_allowed?: boolean
          parent_id?: string | null
          payment_terms?: string | null
          reminder_schedule?: string | null
          route?: string | null
          stop_supply_rule?: string
          territory?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          allow_invoice_download?: boolean
          allow_ledger?: boolean
          allow_online_order?: boolean
          allow_outstanding?: boolean
          allow_payment?: boolean
          allow_scheme_visibility?: boolean
          allow_stock_visibility?: boolean
          approval_required?: boolean
          auto_debit_note?: boolean
          auto_interest?: boolean
          beat?: string | null
          business_id?: string
          collection_priority?: string
          created_at?: string
          default_cd_pct?: number | null
          default_credit_days?: number | null
          default_credit_limit?: number | null
          default_discount_mode?: string
          default_price_level?: string | null
          default_price_list_id?: string | null
          default_rd_pct?: number | null
          default_salesman_id?: string | null
          default_salesman_name?: string | null
          default_scheme_id?: string | null
          default_transport?: string | null
          default_warehouse_id?: string | null
          freight_rule?: string | null
          grace_days?: number
          group_code?: string | null
          gst_type_default?: string | null
          id?: string
          interest_pct?: number
          is_active?: boolean
          is_system?: boolean
          ledger_group_id?: string | null
          margin_rule_pct?: number | null
          name?: string
          override_allowed?: boolean
          parent_id?: string | null
          payment_terms?: string | null
          reminder_schedule?: string | null
          route?: string | null
          stop_supply_rule?: string
          territory?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_groups_default_price_list_fkey"
            columns: ["default_price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_groups_default_scheme_id_fkey"
            columns: ["default_scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_groups_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_groups_ledger_group_id_fkey"
            columns: ["ledger_group_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "party_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      party_price_assignments: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          party_group_id: string | null
          party_id: string | null
          price_list_id: string
          priority: number
          remarks: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          party_group_id?: string | null
          party_id?: string | null
          price_list_id: string
          priority?: number
          remarks?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          party_group_id?: string | null
          party_id?: string | null
          price_list_id?: string
          priority?: number
          remarks?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_price_assignments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_price_assignments_party_group_id_fkey"
            columns: ["party_group_id"]
            isOneToOne: false
            referencedRelation: "party_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_price_assignments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_price_assignments_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          payment_entry_id: string
          sales_invoice_id: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          payment_entry_id: string
          sales_invoice_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          payment_entry_id?: string
          sales_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_entry_id_fkey"
            columns: ["payment_entry_id"]
            isOneToOne: false
            referencedRelation: "payment_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_entries: {
        Row: {
          amount: number | null
          approval_status: string | null
          bank_account_id: string | null
          business_id: string | null
          cash_ledger_id: string | null
          created_at: string | null
          id: string
          is_reversed: boolean
          notes: string | null
          party_id: string | null
          payment_date: string | null
          payment_mode: string | null
          reference_number: string | null
          remarks: string | null
          reversed_at: string | null
          reversed_by: string | null
          reversed_reason: string | null
          voucher_id: string | null
        }
        Insert: {
          amount?: number | null
          approval_status?: string | null
          bank_account_id?: string | null
          business_id?: string | null
          cash_ledger_id?: string | null
          created_at?: string | null
          id?: string
          is_reversed?: boolean
          notes?: string | null
          party_id?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          remarks?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_reason?: string | null
          voucher_id?: string | null
        }
        Update: {
          amount?: number | null
          approval_status?: string | null
          bank_account_id?: string | null
          business_id?: string | null
          cash_ledger_id?: string | null
          created_at?: string | null
          id?: string
          is_reversed?: boolean
          notes?: string | null
          party_id?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          remarks?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_reason?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_entries_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
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
      permission_templates: {
        Row: {
          business_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean
          name: string
          permissions: Json
          role: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          name: string
          permissions: Json
          role?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Json
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_list_items: {
        Row: {
          bin_id: string | null
          description: string
          id: string
          order_item_id: string | null
          part_number: string
          picking_list_id: string
          position: number
          qty_picked: number
          qty_to_pick: number
          rack: string | null
        }
        Insert: {
          bin_id?: string | null
          description?: string
          id?: string
          order_item_id?: string | null
          part_number?: string
          picking_list_id: string
          position?: number
          qty_picked?: number
          qty_to_pick?: number
          rack?: string | null
        }
        Update: {
          bin_id?: string | null
          description?: string
          id?: string
          order_item_id?: string | null
          part_number?: string
          picking_list_id?: string
          position?: number
          qty_picked?: number
          qty_to_pick?: number
          rack?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "picking_list_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "picking_list_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_picking_list_id_fkey"
            columns: ["picking_list_id"]
            isOneToOne: false
            referencedRelation: "picking_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_lists: {
        Row: {
          business_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_id: string
          party_id: string | null
          party_name: string | null
          picking_date: string
          picking_number: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          party_id?: string | null
          party_name?: string | null
          picking_date?: string
          picking_number: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          party_id?: string | null
          party_name?: string | null
          picking_date?: string
          picking_number?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_lists_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "picking_lists_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_lists_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      po_activity_logs: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          purchase_order_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          purchase_order_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          purchase_order_id?: string
          user_id?: string
        }
        Relationships: []
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
      price_list_items: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          formula: string | null
          id: string
          mrp: number | null
          price: number
          price_list_id: string
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          formula?: string | null
          id?: string
          mrp?: number | null
          price: number
          price_list_id: string
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          formula?: string | null
          id?: string
          mrp?: number | null
          price?: number
          price_list_id?: string
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      price_lists: {
        Row: {
          business_id: string
          code: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          is_default: boolean
          list_type: string | null
          name: string
          price_basis: string | null
          price_source: string | null
          rounding_policy: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          list_type?: string | null
          name: string
          price_basis?: string | null
          price_source?: string | null
          rounding_policy?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          list_type?: string | null
          name?: string
          price_basis?: string | null
          price_source?: string | null
          rounding_policy?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
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
      pricing_rule_benefits: {
        Row: {
          benefit_type: string
          created_at: string
          free_product_id: string | null
          free_qty: number | null
          id: string
          max_benefit_amount: number | null
          rule_id: string
          value: number | null
        }
        Insert: {
          benefit_type: string
          created_at?: string
          free_product_id?: string | null
          free_qty?: number | null
          id?: string
          max_benefit_amount?: number | null
          rule_id: string
          value?: number | null
        }
        Update: {
          benefit_type?: string
          created_at?: string
          free_product_id?: string | null
          free_qty?: number | null
          id?: string
          max_benefit_amount?: number | null
          rule_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_benefits_free_product_id_fkey"
            columns: ["free_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rule_benefits_free_product_id_fkey"
            columns: ["free_product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pricing_rule_benefits_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rule_conditions: {
        Row: {
          condition_type: string
          created_at: string
          id: string
          operator: string
          rule_id: string
          value: Json
        }
        Insert: {
          condition_type: string
          created_at?: string
          id?: string
          operator: string
          rule_id: string
          value: Json
        }
        Update: {
          condition_type?: string
          created_at?: string
          id?: string
          operator?: string
          rule_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_conditions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rule_targets: {
        Row: {
          created_at: string
          id: string
          rule_id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          rule_id: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          rule_id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_targets_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          applicable_from_time: string | null
          applicable_to_time: string | null
          approval_required: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_id: string
          created_at: string
          created_by: string | null
          day_of_week: string[] | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          financial_year: string | null
          id: string
          name: string
          priority: number
          reason: string | null
          remarks: string | null
          rule_type: string
          stacking_mode: string | null
          status: string
          supersedes_rule_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          applicable_from_time?: string | null
          applicable_to_time?: string | null
          approval_required?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          day_of_week?: string[] | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          financial_year?: string | null
          id?: string
          name: string
          priority?: number
          reason?: string | null
          remarks?: string | null
          rule_type: string
          stacking_mode?: string | null
          status?: string
          supersedes_rule_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          applicable_from_time?: string | null
          applicable_to_time?: string | null
          approval_required?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: string[] | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          financial_year?: string | null
          id?: string
          name?: string
          priority?: number
          reason?: string | null
          remarks?: string | null
          rule_type?: string
          stacking_mode?: string | null
          status?: string
          supersedes_rule_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_supersedes_rule_id_fkey"
            columns: ["supersedes_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      print_audit_log: {
        Row: {
          action: string
          business_id: string
          copy_labels: string[] | null
          created_at: string
          document_id: string | null
          document_number: string | null
          document_type_id: string
          id: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          business_id: string
          copy_labels?: string[] | null
          created_at?: string
          document_id?: string | null
          document_number?: string | null
          document_type_id: string
          id?: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          business_id?: string
          copy_labels?: string[] | null
          created_at?: string
          document_id?: string | null
          document_number?: string | null
          document_type_id?: string
          id?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      print_copy_types: {
        Row: {
          business_id: string
          created_at: string
          enabled: boolean
          id: string
          is_default: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_copy_types_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      print_profiles: {
        Row: {
          bank_details: Json | null
          business_id: string
          created_at: string
          document_label: string
          document_type: string
          id: string
          is_default: boolean
          item_grid_mode: string
          language: string
          logo_position: string
          margin_bottom_mm: number
          margin_left_mm: number
          margin_right_mm: number
          margin_top_mm: number
          name: string
          orientation: string
          page_size: string
          party_label: string
          purpose_text: string | null
          show_amount: boolean
          show_bank_details: boolean
          show_batch_serial: boolean
          show_discount: boolean
          show_discount_column: boolean
          show_footer: boolean
          show_gst_summary: boolean
          show_header: boolean
          show_hsn: boolean
          show_mrp: boolean
          show_party: boolean
          show_qr_code: boolean
          show_rate: boolean
          show_signature: boolean
          show_transport_section: boolean
          show_warehouse: boolean
          show_watermark: boolean
          show_weight: boolean
          template_id: string
          terms: Json
          updated_at: string
          watermark_text: string | null
        }
        Insert: {
          bank_details?: Json | null
          business_id: string
          created_at?: string
          document_label: string
          document_type: string
          id?: string
          is_default?: boolean
          item_grid_mode?: string
          language?: string
          logo_position?: string
          margin_bottom_mm?: number
          margin_left_mm?: number
          margin_right_mm?: number
          margin_top_mm?: number
          name: string
          orientation?: string
          page_size?: string
          party_label?: string
          purpose_text?: string | null
          show_amount?: boolean
          show_bank_details?: boolean
          show_batch_serial?: boolean
          show_discount?: boolean
          show_discount_column?: boolean
          show_footer?: boolean
          show_gst_summary?: boolean
          show_header?: boolean
          show_hsn?: boolean
          show_mrp?: boolean
          show_party?: boolean
          show_qr_code?: boolean
          show_rate?: boolean
          show_signature?: boolean
          show_transport_section?: boolean
          show_warehouse?: boolean
          show_watermark?: boolean
          show_weight?: boolean
          template_id?: string
          terms?: Json
          updated_at?: string
          watermark_text?: string | null
        }
        Update: {
          bank_details?: Json | null
          business_id?: string
          created_at?: string
          document_label?: string
          document_type?: string
          id?: string
          is_default?: boolean
          item_grid_mode?: string
          language?: string
          logo_position?: string
          margin_bottom_mm?: number
          margin_left_mm?: number
          margin_right_mm?: number
          margin_top_mm?: number
          name?: string
          orientation?: string
          page_size?: string
          party_label?: string
          purpose_text?: string | null
          show_amount?: boolean
          show_bank_details?: boolean
          show_batch_serial?: boolean
          show_discount?: boolean
          show_discount_column?: boolean
          show_footer?: boolean
          show_gst_summary?: boolean
          show_header?: boolean
          show_hsn?: boolean
          show_mrp?: boolean
          show_party?: boolean
          show_qr_code?: boolean
          show_rate?: boolean
          show_signature?: boolean
          show_transport_section?: boolean
          show_warehouse?: boolean
          show_watermark?: boolean
          show_weight?: boolean
          template_id?: string
          terms?: Json
          updated_at?: string
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_profiles_business_id_fkey"
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
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_batches: {
        Row: {
          batch_number: string
          bin_id: string | null
          business_id: string
          created_at: string
          expiry_date: string | null
          id: string
          mfg_date: string | null
          notes: string | null
          product_id: string
          qty: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          batch_number: string
          bin_id?: string | null
          business_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          notes?: string | null
          product_id: string
          qty?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string
          bin_id?: string | null
          business_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          mfg_date?: string | null
          notes?: string | null
          product_id?: string
          qty?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "product_batches_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          business_id: string
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groups: {
        Row: {
          business_id: string
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_locations: {
        Row: {
          bin_id: string
          business_id: string
          created_at: string
          id: string
          is_default: boolean
          priority: number
          product_id: string
          updated_at: string
        }
        Insert: {
          bin_id: string
          business_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          priority?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          bin_id?: string
          business_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          priority?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_locations_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "product_locations_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_serials: {
        Row: {
          bin_id: string | null
          business_id: string
          created_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          product_id: string
          received_at: string
          serial_number: string
          sold_at: string | null
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          bin_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          product_id: string
          received_at?: string
          serial_number: string
          sold_at?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          bin_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          product_id?: string
          received_at?: string
          serial_number?: string
          sold_at?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_serials_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "product_serials_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_serials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_serials_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_serials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_serials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_serials_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_units: {
        Row: {
          barcode: string | null
          business_id: string | null
          conversion_factor: number
          created_at: string
          dealer_rate: number | null
          discount: number | null
          id: string
          is_purchase: boolean
          is_sales: boolean
          is_stock: boolean
          mrp: number | null
          product_id: string
          purchase_rate: number | null
          rd_rate: number | null
          sales_rate: number | null
          scheme: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          business_id?: string | null
          conversion_factor?: number
          created_at?: string
          dealer_rate?: number | null
          discount?: number | null
          id?: string
          is_purchase?: boolean
          is_sales?: boolean
          is_stock?: boolean
          mrp?: number | null
          product_id: string
          purchase_rate?: number | null
          rd_rate?: number | null
          sales_rate?: number | null
          scheme?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          business_id?: string | null
          conversion_factor?: number
          created_at?: string
          dealer_rate?: number | null
          discount?: number | null
          id?: string
          is_purchase?: boolean
          is_sales?: boolean
          is_stock?: boolean
          mrp?: number | null
          product_id?: string
          purchase_rate?: number | null
          rd_rate?: number | null
          sales_rate?: number | null
          scheme?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_units_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          accept_online_orders: boolean | null
          allow_credit_orders: boolean | null
          barcode: string | null
          base_unit_id: string | null
          batch_tracking: boolean | null
          brand: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          category: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          dealer_rate: number | null
          default_bin_id: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          group_id: string | null
          gst_pct: number | null
          gst_type: string
          hsn_code: string | null
          id: string
          is_deleted: boolean
          is_exempt: boolean
          is_locked: boolean
          itc_eligible: boolean
          item_name: string | null
          location: string | null
          locked_at: string | null
          locked_by: string | null
          low_stock_threshold: number | null
          max_stock: number | null
          measurement_category_id: string | null
          min_stock: number | null
          mrp: number | null
          name: string
          notes: string | null
          opening_stock: number | null
          opening_value: number | null
          pan_india_visibility: boolean | null
          part_number: string
          product_group: string | null
          product_name: string | null
          publish_online: boolean | null
          purchase_price: number | null
          rack: string | null
          rate: number | null
          reorder_point: number | null
          reserved_qty: number
          reverse_charge_applicable: boolean
          sale_rate: number | null
          search_vector: unknown
          segment_id: string | null
          selling_price: number | null
          serial_tracking: boolean | null
          show_price_online: boolean | null
          show_stock_online: boolean | null
          sku: string | null
          status: string | null
          stock: number | null
          stock_on_hold: number
          stock_unit_id: string | null
          tax_type: string | null
          taxability: string
          tracking_type: string
          unit: string | null
          updated_at: string | null
          user_id: string
          vehicle_model: string | null
          weight_kg: number | null
        }
        Insert: {
          accept_online_orders?: boolean | null
          allow_credit_orders?: boolean | null
          barcode?: string | null
          base_unit_id?: string | null
          batch_tracking?: boolean | null
          brand?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          dealer_rate?: number | null
          default_bin_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          group_id?: string | null
          gst_pct?: number | null
          gst_type?: string
          hsn_code?: string | null
          id?: string
          is_deleted?: boolean
          is_exempt?: boolean
          is_locked?: boolean
          itc_eligible?: boolean
          item_name?: string | null
          location?: string | null
          locked_at?: string | null
          locked_by?: string | null
          low_stock_threshold?: number | null
          max_stock?: number | null
          measurement_category_id?: string | null
          min_stock?: number | null
          mrp?: number | null
          name: string
          notes?: string | null
          opening_stock?: number | null
          opening_value?: number | null
          pan_india_visibility?: boolean | null
          part_number: string
          product_group?: string | null
          product_name?: string | null
          publish_online?: boolean | null
          purchase_price?: number | null
          rack?: string | null
          rate?: number | null
          reorder_point?: number | null
          reserved_qty?: number
          reverse_charge_applicable?: boolean
          sale_rate?: number | null
          search_vector?: unknown
          segment_id?: string | null
          selling_price?: number | null
          serial_tracking?: boolean | null
          show_price_online?: boolean | null
          show_stock_online?: boolean | null
          sku?: string | null
          status?: string | null
          stock?: number | null
          stock_on_hold?: number
          stock_unit_id?: string | null
          tax_type?: string | null
          taxability?: string
          tracking_type?: string
          unit?: string | null
          updated_at?: string | null
          user_id: string
          vehicle_model?: string | null
          weight_kg?: number | null
        }
        Update: {
          accept_online_orders?: boolean | null
          allow_credit_orders?: boolean | null
          barcode?: string | null
          base_unit_id?: string | null
          batch_tracking?: boolean | null
          brand?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          dealer_rate?: number | null
          default_bin_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          group_id?: string | null
          gst_pct?: number | null
          gst_type?: string
          hsn_code?: string | null
          id?: string
          is_deleted?: boolean
          is_exempt?: boolean
          is_locked?: boolean
          itc_eligible?: boolean
          item_name?: string | null
          location?: string | null
          locked_at?: string | null
          locked_by?: string | null
          low_stock_threshold?: number | null
          max_stock?: number | null
          measurement_category_id?: string | null
          min_stock?: number | null
          mrp?: number | null
          name?: string
          notes?: string | null
          opening_stock?: number | null
          opening_value?: number | null
          pan_india_visibility?: boolean | null
          part_number?: string
          product_group?: string | null
          product_name?: string | null
          publish_online?: boolean | null
          purchase_price?: number | null
          rack?: string | null
          rate?: number | null
          reorder_point?: number | null
          reserved_qty?: number
          reverse_charge_applicable?: boolean
          sale_rate?: number | null
          search_vector?: unknown
          segment_id?: string | null
          selling_price?: number | null
          serial_tracking?: boolean | null
          show_price_online?: boolean | null
          show_stock_online?: boolean | null
          sku?: string | null
          status?: string | null
          stock?: number | null
          stock_on_hold?: number
          stock_unit_id?: string | null
          tax_type?: string | null
          taxability?: string
          tracking_type?: string
          unit?: string | null
          updated_at?: string | null
          user_id?: string
          vehicle_model?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_business"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_bin_id_fkey"
            columns: ["default_bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "products_default_bin_id_fkey"
            columns: ["default_bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_hsn_code_fkey"
            columns: ["hsn_code"]
            isOneToOne: false
            referencedRelation: "hsn_master"
            referencedColumns: ["hsn_code"]
          },
          {
            foreignKeyName: "products_measurement_category_id_fkey"
            columns: ["measurement_category_id"]
            isOneToOne: false
            referencedRelation: "measurement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_stock_unit_id_fkey"
            columns: ["stock_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
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
          avatar_url?: string | null
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
          avatar_url?: string | null
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
      purchase_invoice_activity_logs: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          purchase_invoice_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          purchase_invoice_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          purchase_invoice_id?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_invoice_items: {
        Row: {
          business_id: string | null
          cess_amount: number
          cgst_amount: number
          cgst_rate: number
          description: string | null
          discount_percent: number | null
          gst_percent: number | null
          hsn: string | null
          id: string
          igst_amount: number
          igst_rate: number
          line_total: number | null
          part_number: string | null
          position: number
          product_id: string | null
          purchase_invoice_id: string | null
          purchase_price: number | null
          quantity: number
          sgst_amount: number
          sgst_rate: number
          stock_qty: number | null
          unit_id: string | null
        }
        Insert: {
          business_id?: string | null
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          description?: string | null
          discount_percent?: number | null
          gst_percent?: number | null
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          line_total?: number | null
          part_number?: string | null
          position?: number
          product_id?: string | null
          purchase_invoice_id?: string | null
          purchase_price?: number | null
          quantity?: number
          sgst_amount?: number
          sgst_rate?: number
          stock_qty?: number | null
          unit_id?: string | null
        }
        Update: {
          business_id?: string | null
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          description?: string | null
          discount_percent?: number | null
          gst_percent?: number | null
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          line_total?: number | null
          part_number?: string | null
          position?: number
          product_id?: string | null
          purchase_invoice_id?: string | null
          purchase_price?: number | null
          quantity?: number
          sgst_amount?: number
          sgst_rate?: number
          stock_qty?: number | null
          unit_id?: string | null
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
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          due_date: string | null
          goods_receipt_id: string | null
          grand_total: number | null
          gst_registration_id: string | null
          gst_total: number | null
          id: string
          invoice_date: string | null
          invoice_number: string
          notes: string | null
          paid_amount: number
          purchase_order_id: string | null
          status: string | null
          subtotal: number | null
          supplier_id: string | null
          supplier_invoice_number: string | null
          updated_by: string | null
          voucher_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_total?: number | null
          due_date?: string | null
          goods_receipt_id?: string | null
          grand_total?: number | null
          gst_registration_id?: string | null
          gst_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          purchase_order_id?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          updated_by?: string | null
          voucher_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_total?: number | null
          due_date?: string | null
          goods_receipt_id?: string | null
          grand_total?: number | null
          gst_registration_id?: string | null
          gst_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          purchase_order_id?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          updated_by?: string | null
          voucher_id?: string | null
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
            foreignKeyName: "purchase_invoices_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_gst_registration_id_fkey"
            columns: ["gst_registration_id"]
            isOneToOne: false
            referencedRelation: "business_gst_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          stock_qty: number | null
          tax_amount: number
          taxable_amount: number
          total_amount: number
          unit_id: string | null
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
          stock_qty?: number | null
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
          unit_id?: string | null
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
          stock_qty?: number | null
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
          unit_id?: string | null
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
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
      purchase_return_items: {
        Row: {
          business_id: string
          description: string | null
          gst_pct: number
          id: string
          line_total: number
          part_number: string | null
          product_id: string | null
          purchase_invoice_item_id: string
          qty: number
          rate: number
          return_id: string
        }
        Insert: {
          business_id: string
          description?: string | null
          gst_pct?: number
          id?: string
          line_total?: number
          part_number?: string | null
          product_id?: string | null
          purchase_invoice_item_id: string
          qty: number
          rate?: number
          return_id: string
        }
        Update: {
          business_id?: string
          description?: string | null
          gst_pct?: number
          id?: string
          line_total?: number
          part_number?: string | null
          product_id?: string | null
          purchase_invoice_item_id?: string
          qty?: number
          rate?: number
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_invoice_item_id_fkey"
            columns: ["purchase_invoice_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          business_id: string
          created_at: string
          goods_receipt_item_id: string | null
          gst_amount: number
          id: string
          purchase_invoice_id: string
          reason: string | null
          reason_category: string | null
          return_date: string
          return_number: string
          source: string
          status: string
          supplier_id: string
          taxable_amount: number
          total_amount: number
          user_id: string
          voucher_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          goods_receipt_item_id?: string | null
          gst_amount?: number
          id?: string
          purchase_invoice_id: string
          reason?: string | null
          reason_category?: string | null
          return_date?: string
          return_number: string
          source?: string
          status?: string
          supplier_id: string
          taxable_amount?: number
          total_amount?: number
          user_id: string
          voucher_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          goods_receipt_item_id?: string | null
          gst_amount?: number
          id?: string
          purchase_invoice_id?: string
          reason?: string | null
          reason_category?: string | null
          return_date?: string
          return_number?: string
          source?: string
          status?: string
          supplier_id?: string
          taxable_amount?: number
          total_amount?: number
          user_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          description: string
          discount_pct: number
          gst_pct: number
          id: string
          mrp: number
          net_rate: number
          part_number: string
          position: number
          product_id: string | null
          qty: number
          quotation_id: string
          total: number
          unit_id: string | null
          vehicle_model: string | null
        }
        Insert: {
          description?: string
          discount_pct?: number
          gst_pct?: number
          id?: string
          mrp?: number
          net_rate?: number
          part_number?: string
          position?: number
          product_id?: string | null
          qty?: number
          quotation_id: string
          total?: number
          unit_id?: string | null
          vehicle_model?: string | null
        }
        Update: {
          description?: string
          discount_pct?: number
          gst_pct?: number
          id?: string
          mrp?: number
          net_rate?: number
          part_number?: string
          position?: number
          product_id?: string | null
          qty?: number
          quotation_id?: string
          total?: number
          unit_id?: string | null
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          billing_address: string | null
          business_id: string
          converted_order_id: string | null
          created_at: string
          discount_total: number
          grand_total: number
          gst_total: number
          id: string
          is_latest: boolean
          party_id: string | null
          party_name: string | null
          party_snapshot: Json | null
          quotation_date: string
          quotation_number: string
          reference_no: string | null
          remarks: string | null
          revision_number: number
          root_quotation_id: string
          salesman: string | null
          shipping_address: string | null
          shipping_charges: number | null
          status: string
          subtotal: number
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          billing_address?: string | null
          business_id: string
          converted_order_id?: string | null
          created_at?: string
          discount_total?: number
          grand_total?: number
          gst_total?: number
          id?: string
          is_latest?: boolean
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          quotation_date?: string
          quotation_number: string
          reference_no?: string | null
          remarks?: string | null
          revision_number?: number
          root_quotation_id: string
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number | null
          status?: string
          subtotal?: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          billing_address?: string | null
          business_id?: string
          converted_order_id?: string | null
          created_at?: string
          discount_total?: number
          grand_total?: number
          gst_total?: number
          id?: string
          is_latest?: boolean
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          quotation_date?: string
          quotation_number?: string
          reference_no?: string | null
          remarks?: string | null
          revision_number?: number
          root_quotation_id?: string
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number | null
          status?: string
          subtotal?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "quotations_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_root_fk"
            columns: ["root_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
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
            foreignKeyName: "retailer_cart_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
          enable_closing: boolean
          enable_dispatch_module: boolean
          enable_eway_details: boolean
          enable_invoice_approval: boolean
          enable_lead: boolean
          enable_multi_warehouse: boolean
          enable_order_approval: boolean
          enable_packing: boolean
          enable_packing_slip: boolean
          enable_partial_dispatch: boolean
          enable_picking: boolean
          enable_quotation: boolean
          enable_sales_order: boolean
          enable_salesman_tracking: boolean
          enable_transport_details: boolean
          freeze_date: string | null
          id: string
          invoice_timing: string
          payment_required_before_closing: boolean
          stock_reduction_point: string
          updated_at: string | null
          voucher_lock_enabled: boolean
          workflow_preset: string
        }
        Insert: {
          approval_required?: boolean
          business_id: string
          created_at?: string | null
          enable_batch_tracking?: boolean
          enable_box_packing?: boolean
          enable_case_number?: boolean
          enable_closing?: boolean
          enable_dispatch_module?: boolean
          enable_eway_details?: boolean
          enable_invoice_approval?: boolean
          enable_lead?: boolean
          enable_multi_warehouse?: boolean
          enable_order_approval?: boolean
          enable_packing?: boolean
          enable_packing_slip?: boolean
          enable_partial_dispatch?: boolean
          enable_picking?: boolean
          enable_quotation?: boolean
          enable_sales_order?: boolean
          enable_salesman_tracking?: boolean
          enable_transport_details?: boolean
          freeze_date?: string | null
          id?: string
          invoice_timing?: string
          payment_required_before_closing?: boolean
          stock_reduction_point?: string
          updated_at?: string | null
          voucher_lock_enabled?: boolean
          workflow_preset?: string
        }
        Update: {
          approval_required?: boolean
          business_id?: string
          created_at?: string | null
          enable_batch_tracking?: boolean
          enable_box_packing?: boolean
          enable_case_number?: boolean
          enable_closing?: boolean
          enable_dispatch_module?: boolean
          enable_eway_details?: boolean
          enable_invoice_approval?: boolean
          enable_lead?: boolean
          enable_multi_warehouse?: boolean
          enable_order_approval?: boolean
          enable_packing?: boolean
          enable_packing_slip?: boolean
          enable_partial_dispatch?: boolean
          enable_picking?: boolean
          enable_quotation?: boolean
          enable_sales_order?: boolean
          enable_salesman_tracking?: boolean
          enable_transport_details?: boolean
          freeze_date?: string | null
          id?: string
          invoice_timing?: string
          payment_required_before_closing?: boolean
          stock_reduction_point?: string
          updated_at?: string | null
          voucher_lock_enabled?: boolean
          workflow_preset?: string
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
          stock_qty: number | null
          total: number | null
          unit_id: string | null
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
          stock_qty?: number | null
          total?: number | null
          unit_id?: string | null
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
          stock_qty?: number | null
          total?: number | null
          unit_id?: string | null
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
          {
            foreignKeyName: "sales_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_invoice_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          created_by: string | null
          credit_days_snapshot: number | null
          customer_type: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_total: number | null
          dispatch_id: string | null
          due_date: string
          e_invoice_status: string | null
          eway_bill_no: string | null
          grand_total: number | null
          gst_registration_id: string | null
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
          paid_amount: number
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
          updated_by: string | null
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
          created_by?: string | null
          credit_days_snapshot?: number | null
          customer_type?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_total?: number | null
          dispatch_id?: string | null
          due_date: string
          e_invoice_status?: string | null
          eway_bill_no?: string | null
          grand_total?: number | null
          gst_registration_id?: string | null
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
          paid_amount?: number
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
          updated_by?: string | null
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
          created_by?: string | null
          credit_days_snapshot?: number | null
          customer_type?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_total?: number | null
          dispatch_id?: string | null
          due_date?: string
          e_invoice_status?: string | null
          eway_bill_no?: string | null
          grand_total?: number | null
          gst_registration_id?: string | null
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
          paid_amount?: number
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
          updated_by?: string | null
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
          {
            foreignKeyName: "sales_invoices_gst_registration_id_fkey"
            columns: ["gst_registration_id"]
            isOneToOne: false
            referencedRelation: "business_gst_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_activity_logs: {
        Row: {
          action: string
          business_id: string
          created_at: string
          description: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          return_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          return_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          return_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_activity_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_activity_logs_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          batch_id: string | null
          business_id: string
          description: string | null
          discount_pct: number | null
          gst_pct: number
          hsn: string | null
          id: string
          line_total: number
          part_number: string | null
          position: number | null
          product_id: string | null
          qty: number
          rate: number
          reason: string | null
          remarks: string | null
          return_id: string
          sales_invoice_item_id: string
          unit_id: string | null
        }
        Insert: {
          batch_id?: string | null
          business_id: string
          description?: string | null
          discount_pct?: number | null
          gst_pct?: number
          hsn?: string | null
          id?: string
          line_total?: number
          part_number?: string | null
          position?: number | null
          product_id?: string | null
          qty: number
          rate?: number
          reason?: string | null
          remarks?: string | null
          return_id: string
          sales_invoice_item_id: string
          unit_id?: string | null
        }
        Update: {
          batch_id?: string | null
          business_id?: string
          description?: string | null
          discount_pct?: number | null
          gst_pct?: number
          hsn?: string | null
          id?: string
          line_total?: number
          part_number?: string | null
          position?: number | null
          product_id?: string | null
          qty?: number
          rate?: number
          reason?: string | null
          remarks?: string | null
          return_id?: string
          sales_invoice_item_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_sales_invoice_item_id_fkey"
            columns: ["sales_invoice_item_id"]
            isOneToOne: false
            referencedRelation: "sales_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          business_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          discount_amount: number | null
          gst_amount: number
          id: string
          notes: string | null
          party_id: string
          posted_at: string | null
          posted_by: string | null
          reason: string | null
          return_date: string
          return_number: string
          round_off: number | null
          sales_invoice_id: string
          status: string
          taxable_amount: number
          total_amount: number
          updated_at: string | null
          updated_by: string | null
          user_id: string
          voucher_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          gst_amount?: number
          id?: string
          notes?: string | null
          party_id: string
          posted_at?: string | null
          posted_by?: string | null
          reason?: string | null
          return_date?: string
          return_number: string
          round_off?: number | null
          sales_invoice_id: string
          status?: string
          taxable_amount?: number
          total_amount?: number
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
          voucher_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          gst_amount?: number
          id?: string
          notes?: string | null
          party_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string
          round_off?: number | null
          sales_invoice_id?: string
          status?: string
          taxable_amount?: number
          total_amount?: number
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
          voucher_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
            foreignKeyName: "scheme_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
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
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      stock_take_items: {
        Row: {
          bin_id: string | null
          counted_qty: number | null
          created_at: string
          id: string
          notes: string | null
          product_id: string
          sheet_id: string
          system_qty: number
        }
        Insert: {
          bin_id?: string | null
          counted_qty?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          sheet_id: string
          system_qty: number
        }
        Update: {
          bin_id?: string | null
          counted_qty?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          sheet_id?: string
          system_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_take_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "stock_take_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_take_items_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "stock_take_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_take_sheets: {
        Row: {
          business_id: string
          count_date: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          sheet_no: string | null
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          business_id: string
          count_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          sheet_no?: string | null
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          business_id?: string
          count_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          sheet_no?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_take_sheets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_sheets_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          from_bin_id: string | null
          id: string
          notes: string | null
          product_id: string
          qty: number
          to_bin_id: string | null
          transfer_id: string
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          from_bin_id?: string | null
          id?: string
          notes?: string | null
          product_id: string
          qty: number
          to_bin_id?: string | null
          transfer_id: string
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          from_bin_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          qty?: number
          to_bin_id?: string | null
          transfer_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_from_bin_id_fkey"
            columns: ["from_bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_from_bin_id_fkey"
            columns: ["from_bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_to_bin_id_fkey"
            columns: ["to_bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_to_bin_id_fkey"
            columns: ["to_bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          business_id: string | null
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          from_warehouse_id: string | null
          id: string
          notes: string | null
          received_at: string | null
          status: string | null
          to_warehouse_id: string | null
          transfer_date: string | null
          transfer_no: string | null
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          status?: string | null
          to_warehouse_id?: string | null
          transfer_date?: string | null
          transfer_no?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          status?: string | null
          to_warehouse_id?: string | null
          transfer_date?: string | null
          transfer_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      supplier_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          mode: string
          payment_date: string
          payment_ref: string
          purchase_invoice_id: string | null
          reference_note: string | null
          supplier_id: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          payment_date?: string
          payment_ref: string
          purchase_invoice_id?: string | null
          reference_note?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          payment_date?: string
          payment_ref?: string
          purchase_invoice_id?: string | null
          reference_note?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          business_id: string | null
          created_at: string
          factor: number
          from_unit_id: string
          id: string
          to_unit_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          factor: number
          from_unit_id: string
          id?: string
          to_unit_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          factor?: number
          from_unit_id?: string
          id?: string
          to_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          allow_decimal: boolean
          business_id: string | null
          category_id: string
          conversion_factor: number
          created_at: string
          decimal_places: number
          id: string
          is_base: boolean
          is_system: boolean
          name: string
          symbol: string
        }
        Insert: {
          allow_decimal?: boolean
          business_id?: string | null
          category_id: string
          conversion_factor?: number
          created_at?: string
          decimal_places?: number
          id?: string
          is_base?: boolean
          is_system?: boolean
          name: string
          symbol: string
        }
        Update: {
          allow_decimal?: boolean
          business_id?: string | null
          category_id?: string
          conversion_factor?: number
          created_at?: string
          decimal_places?: number
          id?: string
          is_base?: boolean
          is_system?: boolean
          name?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "measurement_categories"
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
      user_permissions: {
        Row: {
          business_user_id: string
          permissions: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_user_id: string
          permissions: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_user_id?: string
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_business_user_id_fkey"
            columns: ["business_user_id"]
            isOneToOne: true
            referencedRelation: "business_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_print_preferences: {
        Row: {
          default_print_action: string
          updated_at: string
          user_id: string
        }
        Insert: {
          default_print_action?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          default_print_action?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voucher_item_gst_detail: {
        Row: {
          cess_amount: number
          cgst_amount: number
          cgst_rate: number
          created_at: string
          hsn: string | null
          id: string
          igst_amount: number
          igst_rate: number
          place_of_supply: string | null
          sgst_amount: number
          sgst_rate: number
          taxable_value: number
          voucher_item_id: string
        }
        Insert: {
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          place_of_supply?: string | null
          sgst_amount?: number
          sgst_rate?: number
          taxable_value?: number
          voucher_item_id: string
        }
        Update: {
          cess_amount?: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          hsn?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          place_of_supply?: string | null
          sgst_amount?: number
          sgst_rate?: number
          taxable_value?: number
          voucher_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_item_gst_detail_voucher_item_id_fkey"
            columns: ["voucher_item_id"]
            isOneToOne: true
            referencedRelation: "voucher_items"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_items: {
        Row: {
          amount: number | null
          branch_id: string | null
          business_id: string | null
          cost_center_id: string | null
          cr_amount: number
          dr_amount: number
          entry_type: string | null
          financial_year_id: string | null
          gst_amount: number | null
          gst_rate: number | null
          id: string
          ledger_account_id: string | null
          narration: string | null
          position: number
          remarks: string | null
          tax_type: string | null
          user_id: string | null
          voucher_id: string | null
        }
        Insert: {
          amount?: number | null
          branch_id?: string | null
          business_id?: string | null
          cost_center_id?: string | null
          cr_amount?: number
          dr_amount?: number
          entry_type?: string | null
          financial_year_id?: string | null
          gst_amount?: number | null
          gst_rate?: number | null
          id?: string
          ledger_account_id?: string | null
          narration?: string | null
          position?: number
          remarks?: string | null
          tax_type?: string | null
          user_id?: string | null
          voucher_id?: string | null
        }
        Update: {
          amount?: number | null
          branch_id?: string | null
          business_id?: string | null
          cost_center_id?: string | null
          cr_amount?: number
          dr_amount?: number
          entry_type?: string | null
          financial_year_id?: string | null
          gst_amount?: number | null
          gst_rate?: number | null
          id?: string
          ledger_account_id?: string | null
          narration?: string | null
          position?: number
          remarks?: string | null
          tax_type?: string | null
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
          adjustment_category_id: string | null
          adjustment_category_snapshot: Json | null
          approved_at: string | null
          approved_by: string | null
          bank_branch: string | null
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
          instrument_date: string | null
          instrument_no: string | null
          instrument_type: string | null
          is_deleted: boolean
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          narration: string | null
          note_mode: string | null
          reference_id: string | null
          reference_type: string | null
          status: string | null
          total_amount: number | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
          voucher_date: string | null
          voucher_number: string
          voucher_type: string
        }
        Insert: {
          adjustment_category_id?: string | null
          adjustment_category_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          bank_branch?: string | null
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
          instrument_date?: string | null
          instrument_no?: string | null
          instrument_type?: string | null
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          narration?: string | null
          note_mode?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          voucher_date?: string | null
          voucher_number: string
          voucher_type: string
        }
        Update: {
          adjustment_category_id?: string | null
          adjustment_category_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          bank_branch?: string | null
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
          instrument_date?: string | null
          instrument_no?: string | null
          instrument_type?: string | null
          is_deleted?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          narration?: string | null
          note_mode?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          voucher_date?: string | null
          voucher_number?: string
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_adjustment_category_id_fkey"
            columns: ["adjustment_category_id"]
            isOneToOne: false
            referencedRelation: "note_adjustment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_bins: {
        Row: {
          bin_code: string
          bin_type: string
          business_id: string
          capacity_qty: number | null
          capacity_volume: number | null
          capacity_weight: number | null
          created_at: string
          id: string
          is_locked: boolean
          is_unassigned: boolean
          location_code: string | null
          merged_into_bin_id: string | null
          rack_id: string
          scan_code: string | null
          shelf_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bin_code: string
          bin_type?: string
          business_id: string
          capacity_qty?: number | null
          capacity_volume?: number | null
          capacity_weight?: number | null
          created_at?: string
          id?: string
          is_locked?: boolean
          is_unassigned?: boolean
          location_code?: string | null
          merged_into_bin_id?: string | null
          rack_id: string
          scan_code?: string | null
          shelf_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bin_code?: string
          bin_type?: string
          business_id?: string
          capacity_qty?: number | null
          capacity_volume?: number | null
          capacity_weight?: number | null
          created_at?: string
          id?: string
          is_locked?: boolean
          is_unassigned?: boolean
          location_code?: string | null
          merged_into_bin_id?: string | null
          rack_id?: string
          scan_code?: string | null
          shelf_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_bins_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_bins_merged_into_bin_id_fkey"
            columns: ["merged_into_bin_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["bin_id"]
          },
          {
            foreignKeyName: "warehouse_bins_merged_into_bin_id_fkey"
            columns: ["merged_into_bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_bins_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "warehouse_racks"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_racks: {
        Row: {
          business_id: string
          code: string
          created_at: string
          id: string
          name: string | null
          status: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          id?: string
          name?: string | null
          status?: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          name?: string | null
          status?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_racks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_racks_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "warehouse_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock: {
        Row: {
          avg_cost: number | null
          business_id: string
          id: string
          product_id: string
          qty: number
          total_value: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          avg_cost?: number | null
          business_id: string
          id?: string
          product_id: string
          qty?: number
          total_value?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          avg_cost?: number | null
          business_id?: string
          id?: string
          product_id?: string
          qty?: number
          total_value?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_bin_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "warehouse_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_zones: {
        Row: {
          business_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_zones_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          business_id: string
          code: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean
          status: string
          updated_at: string
          warehouse_name: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean
          status?: string
          updated_at?: string
          warehouse_name: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean
          status?: string
          updated_at?: string
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
      v_bin_stock_balance: {
        Row: {
          bin_id: string | null
          bin_status: string | null
          bin_type: string | null
          business_id: string | null
          location_code: string | null
          part_number: string | null
          product_id: string | null
          product_name: string | null
          qty: number | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_bins_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ledger_statement: {
        Row: {
          amount: number | null
          entry_date: string | null
          entry_side: string | null
          id: string | null
          ledger_name: string | null
          narration: string | null
          reference_id: string | null
          reference_type: string | null
          voucher_no: string | null
          voucher_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _expire_stale_invitations: {
        Args: { _business_id: string }
        Returns: undefined
      }
      _mod: {
        Args: {
          _approve?: boolean
          _cancel?: boolean
          _create?: boolean
          _delete?: boolean
          _edit?: boolean
          _export?: boolean
          _import?: boolean
          _print?: boolean
          _restore?: boolean
          _view?: boolean
        }
        Returns: Json
      }
      _user_default_business: { Args: { _user_id: string }; Returns: string }
      accept_invitation: { Args: { _token: string }; Returns: Json }
      accept_invitation_on_signup: {
        Args: { _email: string; _mobile?: string; _user_id: string }
        Returns: undefined
      }
      add_bank_account: {
        Args: {
          _account_name: string
          _account_number?: string
          _bank_name: string
          _business_id: string
          _ifsc_code?: string
          _opening_balance?: number
        }
        Returns: string
      }
      add_business_user_by_contact: {
        Args: {
          _business_id: string
          _department?: string
          _email?: string
          _expires_days?: number
          _full_name?: string
          _login_enabled?: boolean
          _mobile?: string
          _notes?: string
          _role?: string
        }
        Returns: Json
      }
      apply_ledger_balance_delta: {
        Args: {
          _cr_delta: number
          _dr_delta: number
          _ledger_account_id: string
        }
        Returns: undefined
      }
      approve_dealer_application: {
        Args: { _application_id: string }
        Returns: string
      }
      archive_business: {
        Args: { _business_id: string; _reason?: string }
        Returns: undefined
      }
      audited_update_business: {
        Args: {
          _business_id: string
          _changes: Json
          _ip?: string
          _reason?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      cancel_permanent_delete: {
        Args: { _business_id: string }
        Returns: undefined
      }
      cancel_stock_take: { Args: { _sheet_id: string }; Returns: undefined }
      cancel_stock_transfer: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      check_signup_contact_available: {
        Args: { _email: string; _mobile: string }
        Returns: Json
      }
      coalesce_product_name: {
        Args: { p: Database["public"]["Tables"]["products"]["Row"] }
        Returns: string
      }
      create_business_with_owner: {
        Args: { _business_data: Json; _business_id: string; _owner_id: string }
        Returns: undefined
      }
      create_inventory_adjustment: {
        Args: {
          _adjustment_type: string
          _business_id: string
          _product_id: string
          _qty: number
          _reason: string
          _warehouse_id?: string
        }
        Returns: string
      }
      create_purchase_return: {
        Args: {
          _business_id: string
          _items: Json
          _purchase_invoice_id: string
          _reason: string
        }
        Returns: string
      }
      create_qc_debit_note: {
        Args: {
          _business_id: string
          _goods_receipt_id: string
          _items: Json
          _purchase_invoice_id: string
          _reason_category: string
        }
        Returns: string
      }
      create_sales_return: {
        Args: {
          _business_id: string
          _items: Json
          _reason: string
          _sales_invoice_id: string
        }
        Returns: string
      }
      current_business_id: { Args: never; Returns: string }
      default_permissions_for_role: { Args: { _role: string }; Returns: Json }
      delete_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      dispatch_stock_transfer: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      einvoice_cancel: {
        Args: { _reason: string; _record_id: string }
        Returns: undefined
      }
      einvoice_cancel_record: {
        Args: { _reason: string; _record_id: string }
        Returns: undefined
      }
      einvoice_generate_payload: {
        Args: { _invoice_id: string }
        Returns: Json
      }
      einvoice_record_response: {
        Args: {
          _ack_date: string
          _ack_no: string
          _irn: string
          _record_id: string
          _signed_qr_code: string
        }
        Returns: undefined
      }
      ensure_default_print_copy_types: {
        Args: { _business_id: string }
        Returns: undefined
      }
      ensure_default_print_profiles: {
        Args: { _business_id: string }
        Returns: undefined
      }
      ensure_party_ledger: {
        Args: { _business_id?: string; _party_id: string; _user_id: string }
        Returns: string
      }
      ewaybill_cancel: { Args: { _record_id: string }; Returns: undefined }
      ewaybill_cancel_record: {
        Args: { _reason: string; _record_id: string }
        Returns: undefined
      }
      ewaybill_generate_payload: {
        Args: {
          _distance_km: number
          _invoice_id: string
          _transport_mode?: string
          _vehicle_number: string
        }
        Returns: Json
      }
      ewaybill_record_response: {
        Args: {
          _eway_bill_no: string
          _record_id: string
          _valid_until: string
        }
        Returns: undefined
      }
      execute_permanent_delete: {
        Args: { _business_id: string }
        Returns: undefined
      }
      find_product_locations: {
        Args: { _product_id: string }
        Returns: {
          bin_code: string
          bin_id: string
          bin_status: string
          bin_type: string
          is_default: boolean
          location_code: string
          priority: number
          qty: number
          rack_code: string
          scan_code: string
          shelf_code: string
          warehouse_id: string
          warehouse_name: string
          zone_code: string
        }[]
      }
      get_abc_analysis: {
        Args: {
          p_business_id: string
          p_by?: string
          p_from_date?: string
          p_to_date?: string
        }
        Returns: {
          abc_class: string
          brand: string
          category: string
          cumulative_pct: number
          outward_qty: number
          outward_value: number
          part_number: string
          product_id: string
          product_name: string
          rank: number
          unit: string
        }[]
      }
      get_bin_available_stock: {
        Args: { _bin_id: string; _product_id: string }
        Returns: number
      }
      get_current_portal_business_id: { Args: never; Returns: string }
      get_current_portal_party_id: { Args: never; Returns: string }
      get_dead_stock_report: {
        Args: {
          p_as_of_date?: string
          p_business_id: string
          p_days_threshold?: number
          p_limit?: number
          p_offset?: number
          p_warehouse_id?: string
        }
        Returns: {
          brand: string
          category: string
          closing_qty: number
          closing_value: number
          days_idle: number
          last_movement_date: string
          part_number: string
          product_id: string
          product_name: string
          total_rows: number
          unit: string
        }[]
      }
      get_default_warehouse_id: {
        Args: { _business_id: string }
        Returns: string
      }
      get_effective_party_rules: {
        Args: { _party_id: string }
        Returns: {
          cd_pct: number
          credit_days: number
          credit_limit: number
          gst_type: string
          payment_terms: string
          price_list_id: string
          rd_pct: number
          route: string
          scheme_id: string
          source: string
          territory: string
          zone: string
        }[]
      }
      get_effective_permissions: {
        Args: { _business_user_id: string }
        Returns: Json
      }
      get_fsn_analysis: {
        Args: {
          p_business_id: string
          p_fast_threshold?: number
          p_from_date?: string
          p_slow_threshold?: number
          p_to_date?: string
        }
        Returns: {
          brand: string
          category: string
          closing_qty: number
          fsn_class: string
          movement_count: number
          outward_qty: number
          outward_value: number
          part_number: string
          product_id: string
          product_name: string
          unit: string
        }[]
      }
      get_inventory_dashboard: {
        Args: { p_as_of_date?: string; p_business_id: string }
        Returns: {
          dead_stock: number
          fast_moving: number
          low_stock: number
          negative_stock: number
          non_moving: number
          positive_stock: number
          slow_moving: number
          top_brand: string
          top_category: string
          total_mrp_value: number
          total_products: number
          total_stock_value: number
          zero_stock: number
        }[]
      }
      get_invitation_by_token: { Args: { _token: string }; Returns: Json }
      get_my_permissions: { Args: { _business_id: string }; Returns: Json }
      get_parties_in_use: {
        Args: { _party_ids: string[] }
        Returns: {
          party_id: string
          used_in: string[]
        }[]
      }
      get_products_in_use: {
        Args: { _product_ids: string[] }
        Returns: {
          product_id: string
          used_in: string[]
        }[]
      }
      get_role_template: {
        Args: { _business_id: string; _role: string }
        Returns: Json
      }
      get_stock_ageing: {
        Args: {
          p_as_of_date?: string
          p_brand?: string
          p_business_id: string
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_warehouse_id?: string
        }
        Returns: {
          ageing_bucket: string
          brand: string
          bucket_0_30: number
          bucket_181_365: number
          bucket_31_60: number
          bucket_365_plus: number
          bucket_61_90: number
          bucket_91_180: number
          category: string
          closing_qty: number
          closing_value: number
          days_since_movement: number
          last_movement_date: string
          part_number: string
          product_id: string
          product_name: string
          total_rows: number
          unit: string
        }[]
      }
      get_stock_category_summary: {
        Args: {
          p_business_id: string
          p_from_date?: string
          p_to_date?: string
        }
        Returns: {
          category: string
          closing_qty: number
          closing_value: number
          inward_qty: number
          inward_value: number
          opening_qty: number
          opening_value: number
          outward_qty: number
          outward_value: number
          product_count: number
        }[]
      }
      get_stock_drill_down: {
        Args: {
          p_business_id: string
          p_from_date?: string
          p_product_id: string
          p_to_date?: string
        }
        Returns: {
          inward_qty: number
          notes: string
          outward_qty: number
          party_name: string
          rate: number
          reference_id: string
          reference_type: string
          running_balance: number
          transaction_date: string
          transaction_type: string
          value: number
          voucher_number: string
          warehouse_name: string
        }[]
      }
      get_stock_group_summary: {
        Args: {
          p_business_id: string
          p_from_date?: string
          p_to_date?: string
        }
        Returns: {
          closing_qty: number
          closing_value: number
          group_id: string
          group_name: string
          inward_qty: number
          inward_value: number
          opening_qty: number
          opening_value: number
          outward_qty: number
          outward_value: number
          product_count: number
        }[]
      }
      get_stock_movement_register: {
        Args: {
          p_business_id: string
          p_from_date?: string
          p_limit?: number
          p_movement_type?: string
          p_offset?: number
          p_product_id?: string
          p_to_date?: string
          p_warehouse_id?: string
        }
        Returns: {
          id: string
          inward_qty: number
          movement_date: string
          movement_type: string
          notes: string
          outward_qty: number
          part_number: string
          party_name: string
          product_id: string
          product_name: string
          rate: number
          reference_id: string
          reference_type: string
          stock_after: number
          stock_before: number
          total_rows: number
          value: number
          voucher_number: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_stock_summary: {
        Args: {
          p_brand?: string
          p_business_id: string
          p_category?: string
          p_from_date?: string
          p_group_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_segment_id?: string
          p_stock_filter?: string
          p_to_date?: string
          p_warehouse_id?: string
        }
        Returns: {
          avg_rate: number
          brand: string
          category: string
          closing_qty: number
          closing_value: number
          inward_qty: number
          inward_value: number
          margin_pct: number
          mrp: number
          opening_qty: number
          opening_value: number
          outward_qty: number
          outward_value: number
          part_number: string
          product_group: string
          product_id: string
          product_name: string
          purchase_price: number
          sale_rate: number
          segment: string
          total_rows: number
          unit: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_stock_valuation: {
        Args: {
          p_as_of_date?: string
          p_brand?: string
          p_business_id: string
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_warehouse_id?: string
        }
        Returns: {
          avg_cost: number
          brand: string
          category: string
          closing_qty: number
          mrp: number
          mrp_value: number
          part_number: string
          product_id: string
          product_name: string
          profit_potential: number
          sale_rate: number
          sale_value: number
          total_cost: number
          total_rows: number
          unit: string
        }[]
      }
      get_warehouse_available_stock: {
        Args: { _product_id: string; _warehouse_id: string }
        Returns: number
      }
      get_warehouse_stock_summary: {
        Args: {
          p_business_id: string
          p_from_date?: string
          p_to_date?: string
        }
        Returns: {
          closing_qty: number
          closing_value: number
          inward_qty: number
          inward_value: number
          opening_qty: number
          opening_value: number
          outward_qty: number
          outward_value: number
          product_count: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      gst_2b_import_bulk: {
        Args: { _business_id: string; _rows: Json; _source: string }
        Returns: number
      }
      gst_2b_reconciliation: {
        Args: { _business_id: string; _from_date: string; _to_date: string }
        Returns: {
          books_tax: number
          books_taxable: number
          difference: number
          document_number: string
          portal_tax: number
          portal_taxable: number
          status: string
          supplier_gstin: string
          supplier_name: string
        }[]
      }
      gst_calculate_line: {
        Args: {
          _as_of_date?: string
          _buyer_gstin?: string
          _buyer_place_of_supply_state_code?: string
          _cess_rate?: number
          _hsn_code?: string
          _is_reverse_charge?: boolean
          _override_rate?: number
          _seller_gstin: string
          _taxable_value: number
        }
        Returns: {
          cess_amount: number
          cess_rate: number
          cgst_amount: number
          cgst_rate: number
          igst_amount: number
          igst_rate: number
          is_interstate: boolean
          is_reverse_charge: boolean
          rate: number
          sgst_amount: number
          sgst_rate: number
          taxable_value: number
        }[]
      }
      gst_dashboard_summary: {
        Args: { _business_id: string; _from_date: string; _to_date: string }
        Returns: {
          input_cgst: number
          input_igst: number
          input_sgst: number
          net_payable: number
          output_cgst: number
          output_igst: number
          output_sgst: number
          total_input_tax: number
          total_output_tax: number
        }[]
      }
      gst_engine_run_tests: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      gst_financial_year_lock: {
        Args: { _business_id: string; _fy_start_year: number; _remarks: string }
        Returns: undefined
      }
      gst_financial_year_unlock: {
        Args: { _business_id: string; _fy_start_year: number; _remarks: string }
        Returns: undefined
      }
      gst_invoice_tax_summary_purchase: {
        Args: { _purchase_invoice_id: string }
        Returns: {
          cess: number
          cgst: number
          gst_pct: number
          igst: number
          line_count: number
          sgst: number
          taxable_value: number
        }[]
      }
      gst_invoice_tax_summary_sales: {
        Args: { _sales_invoice_id: string }
        Returns: {
          cess: number
          cgst: number
          gst_pct: number
          igst: number
          line_count: number
          sgst: number
          taxable_value: number
        }[]
      }
      gst_is_fy_locked: {
        Args: { _as_of: string; _business_id: string }
        Returns: boolean
      }
      gst_is_interstate: {
        Args: {
          _buyer_gstin: string
          _buyer_place_of_supply_state_code?: string
          _seller_gstin: string
        }
        Returns: boolean
      }
      gst_itc_reversal_rule42: {
        Args: {
          _common_credit: number
          _exempt_turnover: number
          _total_turnover: number
        }
        Returns: {
          d1_exempt_attributable: number
          d2_deemed_non_business: number
          total_reversal: number
        }[]
      }
      gst_itc_reversal_rule43: {
        Args: {
          _capital_goods_common_credit: number
          _exempt_turnover: number
          _total_turnover: number
          _useful_life_months?: number
        }
        Returns: number
      }
      gst_rate_on_date: {
        Args: { _as_of?: string; _hsn_code: string }
        Returns: number
      }
      gst_reconciliation_invoice_vs_voucher: {
        Args: {
          _business_id: string
          _direction: string
          _from_date: string
          _to_date: string
        }
        Returns: {
          difference: number
          invoice_date: string
          invoice_number: string
          register_gst: number
          status: string
          uses_split_ledgers: boolean
          voucher_gst: number
        }[]
      }
      gst_report_annual_summary: {
        Args: { _business_id: string; _fy_start_year: number }
        Returns: {
          period_month: number
          period_year: number
          purchase_cgst: number
          purchase_igst: number
          purchase_sgst: number
          purchase_taxable: number
          sales_cgst: number
          sales_igst: number
          sales_sgst: number
          sales_taxable: number
        }[]
      }
      gst_report_gstr9c_reconciliation: {
        Args: { _business_id: string; _fy_start_year: number }
        Returns: {
          as_per_books: number
          as_per_filed_returns: number
          difference: number
          metric: string
        }[]
      }
      gst_report_hsn_summary: {
        Args: {
          _business_id: string
          _direction: string
          _from_date: string
          _to_date: string
        }
        Returns: {
          cess: number
          cgst: number
          hsn: string
          igst: number
          sgst: number
          taxable_value: number
          total_qty: number
          total_value: number
        }[]
      }
      gst_report_note_register: {
        Args: {
          _business_id: string
          _from_date: string
          _note_type: string
          _to_date: string
        }
        Returns: {
          against_document: string
          gst_amount: number
          note_date: string
          note_number: string
          party_name: string
          reason: string
          source: string
          taxable_value: number
          total_value: number
        }[]
      }
      gst_report_register: {
        Args: {
          _business_id: string
          _direction: string
          _from_date: string
          _to_date: string
        }
        Returns: {
          cess: number
          cgst: number
          document_date: string
          document_number: string
          igst: number
          invoice_id: string
          is_b2b: boolean
          party_gstin: string
          party_name: string
          place_of_supply: string
          sgst: number
          taxable_value: number
          total_value: number
        }[]
      }
      gst_return_cancel: {
        Args: { _reason: string; _return_id: string }
        Returns: undefined
      }
      gst_return_create_draft: { Args: { _period_id: string }; Returns: string }
      gst_return_decide_approval: {
        Args: { _approval_id: string; _decision: string; _remarks: string }
        Returns: undefined
      }
      gst_return_file: {
        Args: { _arn: string; _return_id: string }
        Returns: undefined
      }
      gst_return_lock_audit: {
        Args: { _period_id: string; _remarks: string }
        Returns: undefined
      }
      gst_return_period_get_or_create: {
        Args: {
          _business_id: string
          _period_month: number
          _period_year: number
          _registration_id: string
          _return_type: string
        }
        Returns: string
      }
      gst_return_populate_gstr1: { Args: { _return_id: string }; Returns: Json }
      gst_return_populate_gstr3b: {
        Args: { _return_id: string }
        Returns: Json
      }
      gst_return_reopen_for_revision: {
        Args: { _period_id: string; _remarks: string }
        Returns: undefined
      }
      gst_return_request_approval: {
        Args: { _approver_role: string; _remarks: string; _return_id: string }
        Returns: string
      }
      gst_return_unlock_audit: {
        Args: { _period_id: string; _remarks: string }
        Returns: undefined
      }
      gst_split_amounts: {
        Args: {
          _buyer_gstin: string
          _buyer_place_of_supply_state_code?: string
          _gst_total: number
          _seller_gstin: string
        }
        Returns: {
          cgst: number
          igst: number
          is_interstate: boolean
          sgst: number
        }[]
      }
      gst_state_code_from_gstin: { Args: { _gstin: string }; Returns: string }
      gst_validate_gstin_checksum: {
        Args: { _gstin: string }
        Returns: boolean
      }
      has_any_business_role: {
        Args: { _roles: Database["public"]["Enums"]["business_role"][] }
        Returns: boolean
      }
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["business_role"][]
        }
        Returns: boolean
      }
      has_permission: {
        Args: { _action: string; _business_id: string; _module: string }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      log_party_activity: {
        Args: {
          _activity_type: string
          _description: string
          _party_id: string
        }
        Returns: undefined
      }
      merge_bin: {
        Args: { _from_bin_id: string; _to_bin_id: string }
        Returns: undefined
      }
      next_adjustment_number: {
        Args: { _business_id: string }
        Returns: string
      }
      next_dispatch_number: {
        Args: { _business_id?: string; _user_id: string }
        Returns: string
      }
      next_invoice_number: {
        Args: { _business_id?: string; _user_id: string }
        Returns: string
      }
      next_order_number: {
        Args: { _business_id?: string; _user_id: string }
        Returns: string
      }
      next_packing_slip_number: { Args: { _user_id: string }; Returns: string }
      next_picking_number: { Args: { _business_id: string }; Returns: string }
      next_po_number: { Args: { _business_id: string }; Returns: string }
      next_purchase_return_number: {
        Args: { _business_id: string }
        Returns: string
      }
      next_quotation_number: { Args: { _business_id: string }; Returns: string }
      next_sales_return_number: {
        Args: { _business_id: string }
        Returns: string
      }
      next_stock_take_number: {
        Args: { _business_id: string }
        Returns: string
      }
      next_stock_transfer_number: {
        Args: { _business_id: string }
        Returns: string
      }
      next_supplier_payment_ref: {
        Args: { _business_id: string }
        Returns: string
      }
      next_voucher_number: {
        Args: { _user_id: string; _voucher_type: string }
        Returns: string
      }
      pending_approvals_count: {
        Args: { _business_id: string }
        Returns: number
      }
      post_purchase_invoice: { Args: { p_invoice_id: string }; Returns: string }
      post_sales_return: { Args: { _return_id: string }; Returns: string }
      post_stock_take: { Args: { _sheet_id: string }; Returns: undefined }
      propagate_group_defaults: {
        Args: { _group_id: string; _scope?: string }
        Returns: number
      }
      recalc_po_quantities: { Args: { _po_id: string }; Returns: undefined }
      receive_sales_payment:
        | {
            Args: {
              _allocations: Json
              _amount: number
              _business_id: string
              _notes: string
              _party_id: string
              _payment_date: string
              _payment_mode: string
              _reference_number: string
            }
            Returns: string
          }
        | {
            Args: {
              _advance_use_amount?: number
              _allocations: Json
              _amount: number
              _bank_account_id?: string
              _business_id: string
              _notes: string
              _party_id: string
              _payment_date: string
              _payment_mode: string
              _reference_number: string
            }
            Returns: string
          }
      receive_stock_transfer: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      recompute_all_balances: {
        Args: { _business_id: string }
        Returns: undefined
      }
      reject_dealer_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: undefined
      }
      reject_invitation: { Args: { _token: string }; Returns: undefined }
      request_permanent_delete: {
        Args: { _business_id: string; _reason?: string }
        Returns: string
      }
      resend_invitation: {
        Args: { _expires_days?: number; _invitation_id: string }
        Returns: Json
      }
      reset_user_permissions: {
        Args: { _business_user_id: string }
        Returns: undefined
      }
      resolve_dispatch_bin: {
        Args: {
          _product_id: string
          _requested_bin_id: string
          _warehouse_id: string
        }
        Returns: string
      }
      restore_business: { Args: { _business_id: string }; Returns: undefined }
      reverse_invoice_advance_allocations: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      reverse_sales_payment: {
        Args: { _payment_entry_id: string; _reason?: string }
        Returns: string
      }
      revoke_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      save_user_permissions: {
        Args: { _business_user_id: string; _permissions: Json }
        Returns: undefined
      }
      seed_accounting_defaults: {
        Args: { _business_id?: string; _user_id: string }
        Returns: undefined
      }
      seed_party_groups: { Args: { _business_id: string }; Returns: undefined }
      seed_unassigned_bin_for_warehouse: {
        Args: { _warehouse_id: string }
        Returns: string
      }
      set_default_print_profile: {
        Args: { _profile_id: string }
        Returns: undefined
      }
      soft_delete_business: {
        Args: { _business_id: string; _reason?: string }
        Returns: undefined
      }
      split_bin: {
        Args: {
          _from_bin_id: string
          _product_id: string
          _qty: number
          _to_bin_id: string
        }
        Returns: undefined
      }
      stock_take_load_all_products: {
        Args: { _sheet_id: string }
        Returns: number
      }
      stock_take_load_bin_products: {
        Args: { _bin_id: string; _sheet_id: string }
        Returns: number
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
      sync_cost_price_from_purchases: {
        Args: { _business_id: string }
        Returns: {
          updated_count: number
        }[]
      }
      unarchive_business: { Args: { _business_id: string }; Returns: undefined }
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
    },
  },
} as const
