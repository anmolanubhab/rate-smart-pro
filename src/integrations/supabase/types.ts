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
          created_at: string
          id: string
          is_system: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          parent_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          parent_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          nature?: Database["public"]["Enums"]["account_nature"]
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string | null
          created_at: string
          device: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      business_users: {
        Row: {
          business_id: string
          id: string
          role: string
          user_id: string
          created_at: string
        }
        Insert: {
          business_id: string
          id?: string
          role?: string
          user_id: string
          created_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          role?: string
          user_id?: string
          created_at?: string
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
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          business_name: string
          business_type: string | null
          city: string | null
          composition_scheme: boolean
          created_at: string
          default_gst_pct: number
          district: string | null
          email: string | null
          firm_name: string | null
          fy_start_month: number
          gst_enabled: boolean
          gst_number: string | null
          id: string
          industry_segment: string | null
          invoice_prefix: string | null
          invoice_terms: string | null
          logo_url: string | null
          mobile: string | null
          msme_number: string | null
          owner_id: string
          owner_name: string | null
          pan_number: string | null
          pincode: string | null
          setup_completed: boolean
          state: string | null
          tan_number: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_name: string
          business_type?: string | null
          city?: string | null
          composition_scheme?: boolean
          created_at?: string
          default_gst_pct?: number
          district?: string | null
          email?: string | null
          firm_name?: string | null
          fy_start_month?: number
          gst_enabled?: boolean
          gst_number?: string | null
          id?: string
          industry_segment?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          mobile?: string | null
          msme_number?: string | null
          owner_id: string
          owner_name?: string | null
          pan_number?: string | null
          pincode?: string | null
          setup_completed?: boolean
          state?: string | null
          tan_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_name?: string
          business_type?: string | null
          city?: string | null
          composition_scheme?: boolean
          created_at?: string
          default_gst_pct?: number
          district?: string | null
          email?: string | null
          firm_name?: string | null
          fy_start_month?: number
          gst_enabled?: boolean
          gst_number?: string | null
          id?: string
          industry_segment?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          mobile?: string | null
          msme_number?: string | null
          owner_id?: string
          owner_name?: string | null
          pan_number?: string | null
          pincode?: string | null
          setup_completed?: boolean
          state?: string | null
          tan_number?: string | null
          updated_at?: string
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
          cd_discount: number | null
          created_at: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          mode: Database["public"]["Enums"]["discount_type"] | null
          party_id: string | null
          party_name: string | null
          rd_amount: number
          required_discount: number
          segment_id: string | null
          total_benefit: number | null
          user_id: string
        }
        Insert: {
          after_rd: number
          bill_amount: number
          bill_discount: number
          bill_on_mrp: number
          cd_discount?: number | null
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          mode?: Database["public"]["Enums"]["discount_type"] | null
          party_id?: string | null
          party_name?: string | null
          rd_amount: number
          required_discount: number
          segment_id?: string | null
          total_benefit?: number | null
          user_id: string
        }
        Update: {
          after_rd?: number
          bill_amount?: number
          bill_discount?: number
          bill_on_mrp?: number
          cd_discount?: number | null
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          mode?: Database["public"]["Enums"]["discount_type"] | null
          party_id?: string | null
          party_name?: string | null
          rd_amount?: number
          required_discount?: number
          segment_id?: string | null
          total_benefit?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_items: {
        Row: {
          created_at: string
          dispatch_id: string
          dispatched_qty: number
          id: string
          order_item_id: string
          rate: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          dispatched_qty?: number
          id?: string
          order_item_id: string
          rate?: number
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          dispatched_qty?: number
          id?: string
          order_item_id?: string
          rate?: number
          total?: number
          user_id?: string
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
          created_at: string
          dispatch_date: string
          dispatch_number: string
          id: string
          notes: string | null
          order_id: string
          party_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dispatch_date?: string
          dispatch_number: string
          id?: string
          notes?: string | null
          order_id: string
          party_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dispatch_date?: string
          dispatch_number?: string
          id?: string
          notes?: string | null
          order_id?: string
          party_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          created_at: string
          delta: number
          id: string
          product_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          product_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          product_id?: string
          reason?: string | null
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
      inventory_import_logs: {
        Row: {
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
          created_at: string
          id: string
          movement_type: string
          notes: string | null
          product_id: string
          qty: number
          reference_id: string | null
          reference_type: string | null
          stock_after: number
          stock_before: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          notes?: string | null
          product_id: string
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          stock_after?: number
          stock_before?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          stock_after?: number
          stock_before?: number
          user_id?: string
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_system: boolean
          ledger_type: Database["public"]["Enums"]["ledger_type"]
          name: string
          notes: string | null
          opening_balance: number
          opening_balance_type: Database["public"]["Enums"]["dr_cr"]
          party_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_system?: boolean
          ledger_type: Database["public"]["Enums"]["ledger_type"]
          name: string
          notes?: string | null
          opening_balance?: number
          opening_balance_type?: Database["public"]["Enums"]["dr_cr"]
          party_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_system?: boolean
          ledger_type?: Database["public"]["Enums"]["ledger_type"]
          name?: string
          notes?: string | null
          opening_balance?: number
          opening_balance_type?: Database["public"]["Enums"]["dr_cr"]
          party_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_activity_logs: {
        Row: {
          action: string
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
          created_at: string
          description: string | null
          discount_pct: number
          dispatched_qty: number
          gst_pct: number
          id: string
          item_status: string
          mrp: number
          net_rate: number
          order_id: string
          part_number: string | null
          pending_qty: number | null
          position: number
          product_id: string | null
          qty: number
          rate: number
          total: number
          user_id: string
          vehicle_model: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_pct?: number
          dispatched_qty?: number
          gst_pct?: number
          id?: string
          item_status?: string
          mrp?: number
          net_rate?: number
          order_id: string
          part_number?: string | null
          pending_qty?: number | null
          position?: number
          product_id?: string | null
          qty?: number
          rate?: number
          total?: number
          user_id: string
          vehicle_model?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_pct?: number
          dispatched_qty?: number
          gst_pct?: number
          id?: string
          item_status?: string
          mrp?: number
          net_rate?: number
          order_id?: string
          part_number?: string | null
          pending_qty?: number | null
          position?: number
          product_id?: string | null
          qty?: number
          rate?: number
          total?: number
          user_id?: string
          vehicle_model?: string | null
        }
        Relationships: [
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
          billing_address: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          cd_total: number
          created_at: string
          deleted_at: string | null
          discount_total: number
          dispatched_total_qty: number
          grand_total: number
          gst_total: number
          id: string
          last_dispatch_date: string | null
          mode: Database["public"]["Enums"]["discount_type"] | null
          notes: string | null
          order_date: string
          order_number: string
          order_type: string
          parent_order_ids: string[]
          party_id: string | null
          party_name: string | null
          party_snapshot: Json | null
          pending_items_count: number
          pending_total_qty: number
          remarks: string | null
          salesman: string | null
          shipping_address: string | null
          shipping_charges: number
          source_type: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          billing_address?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cd_total?: number
          created_at?: string
          deleted_at?: string | null
          discount_total?: number
          dispatched_total_qty?: number
          grand_total?: number
          gst_total?: number
          id?: string
          last_dispatch_date?: string | null
          mode?: Database["public"]["Enums"]["discount_type"] | null
          notes?: string | null
          order_date?: string
          order_number: string
          order_type?: string
          parent_order_ids?: string[]
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          pending_items_count?: number
          pending_total_qty?: number
          remarks?: string | null
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number
          source_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          billing_address?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cd_total?: number
          created_at?: string
          deleted_at?: string | null
          discount_total?: number
          dispatched_total_qty?: number
          grand_total?: number
          gst_total?: number
          id?: string
          last_dispatch_date?: string | null
          mode?: Database["public"]["Enums"]["discount_type"] | null
          notes?: string | null
          order_date?: string
          order_number?: string
          order_type?: string
          parent_order_ids?: string[]
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          pending_items_count?: number
          pending_total_qty?: number
          remarks?: string | null
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number
          source_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
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
          agreed_discount: number
          beat: string | null
          billing_address: string | null
          created_at: string
          credit_limit: number
          default_discount: number
          discount_type: Database["public"]["Enums"]["discount_type"]
          gst: string | null
          id: string
          name: string
          notes: string | null
          outstanding_balance: number
          phone: string | null
          shipping_address: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          agreed_discount?: number
          beat?: string | null
          billing_address?: string | null
          created_at?: string
          credit_limit?: number
          default_discount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          gst?: string | null
          id?: string
          name: string
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          shipping_address?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          agreed_discount?: number
          beat?: string | null
          billing_address?: string | null
          created_at?: string
          credit_limit?: number
          default_discount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          gst?: string | null
          id?: string
          name?: string
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          shipping_address?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      party_discounts: {
        Row: {
          created_at: string
          discount: number
          id: string
          party_id: string
          segment_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          party_id: string
          segment_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          party_id?: string
          segment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_discounts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_discounts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          dealer_rate: number
          gst_pct: number
          id: string
          low_stock_threshold: number
          mrp: number
          name: string
          part_number: string
          status: string
          stock: number
          updated_at: string
          user_id: string
          vehicle_model: string | null
        }
        Insert: {
          barcode?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          dealer_rate?: number
          gst_pct?: number
          id?: string
          low_stock_threshold?: number
          mrp?: number
          name: string
          part_number: string
          status?: string
          stock?: number
          updated_at?: string
          user_id: string
          vehicle_model?: string | null
        }
        Update: {
          barcode?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          dealer_rate?: number
          gst_pct?: number
          id?: string
          low_stock_threshold?: number
          mrp?: number
          name?: string
          part_number?: string
          status?: string
          stock?: number
          updated_at?: string
          user_id?: string
          vehicle_model?: string | null
        }
        Relationships: []
      }
      segments: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      voucher_items: {
        Row: {
          cr_amount: number
          created_at: string
          dr_amount: number
          id: string
          ledger_id: string
          narration: string | null
          position: number
          user_id: string
          voucher_id: string
        }
        Insert: {
          cr_amount?: number
          created_at?: string
          dr_amount?: number
          id?: string
          ledger_id: string
          narration?: string | null
          position?: number
          user_id: string
          voucher_id: string
        }
        Update: {
          cr_amount?: number
          created_at?: string
          dr_amount?: number
          id?: string
          ledger_id?: string
          narration?: string | null
          position?: number
          user_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_items_ledger_id_fkey"
            columns: ["ledger_id"]
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
          voucher_type: Database["public"]["Enums"]["voucher_type"]
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
          voucher_type: Database["public"]["Enums"]["voucher_type"]
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
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          created_at: string
          id: string
          narration: string | null
          reference_id: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          total_amount: number
          updated_at: string
          user_id: string
          voucher_date: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          total_amount?: number
          updated_at?: string
          user_id: string
          voucher_date?: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          created_at?: string
          id?: string
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          total_amount?: number
          updated_at?: string
          user_id?: string
          voucher_date?: string
          voucher_number?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_business_id: { Args: never; Returns: string }
      ensure_party_ledger: {
        Args: { _party_id: string; _user_id: string }
        Returns: string
      }
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["business_role"][]
        }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      next_dispatch_number: { Args: { _user_id: string }; Returns: string }
      next_order_number: { Args: { _user_id: string }; Returns: string }
      next_voucher_number: {
        Args: {
          _type: Database["public"]["Enums"]["voucher_type"]
          _user_id: string
        }
        Returns: string
      }
      recompute_order: { Args: { _order_id: string }; Returns: undefined }
      recompute_order_item: {
        Args: { _order_item_id: string }
        Returns: undefined
      }
      seed_accounting_defaults: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_nature: "asset" | "liability" | "income" | "expense" | "capital"
      business_role:
        | "owner"
        | "admin"
        | "manager"
        | "accountant"
        | "operator"
        | "viewer"
      discount_type: "RD" | "CD"
      dr_cr: "dr" | "cr"
      ledger_type:
        | "cash"
        | "bank"
        | "customer"
        | "supplier"
        | "expense"
        | "income"
        | "gst_input"
        | "gst_output"
        | "asset"
        | "liability"
        | "capital"
        | "system"
      order_status:
        | "draft"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "pending"
        | "partial"
      product_category: "spare" | "lubricant" | "accessory" | "other"
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
      account_nature: ["asset", "liability", "income", "expense", "capital"],
      business_role: [
        "owner",
        "admin",
        "manager",
        "accountant",
        "operator",
        "viewer",
      ],
      discount_type: ["RD", "CD"],
      dr_cr: ["dr", "cr"],
      ledger_type: [
        "cash",
        "bank",
        "customer",
        "supplier",
        "expense",
        "income",
        "gst_input",
        "gst_output",
        "asset",
        "liability",
        "capital",
        "system",
      ],
      order_status: [
        "draft",
        "confirmed",
        "cancelled",
        "completed",
        "pending",
        "partial",
      ],
      product_category: ["spare", "lubricant", "accessory", "other"],
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
      ],
    },
  },
} as const
