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
          created_at: string
          id: string
          is_system: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          parent_id: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          parent_id?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
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
      accounting_settings: {
        Row: {
          business_id: string
          created_at: string
          id: string
          lock_date: string | null
          locked_at: string | null
          locked_by: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          lock_date?: string | null
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
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
      approval_requests: {
        Row: {
          action_type: string
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
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
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
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
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
          status?: string
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
          created_at: string
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          invited_by: string | null
          invited_email: string | null
          joined_at: string
          mobile: string | null
          notes: string | null
          role: Database["public"]["Enums"]["business_role"]
          status: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          joined_at?: string
          mobile?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["business_role"]
          status?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          joined_at?: string
          mobile?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["business_role"]
          status?: string
          updated_at?: string
          user_id?: string
          username?: string | null
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
          business_name: string
          business_type: string | null
          city: string | null
          composition_scheme: boolean
          created_at: string
          default_gst_pct: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
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
          is_deleted: boolean
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
          business_name: string
          business_type?: string | null
          city?: string | null
          composition_scheme?: boolean
          created_at?: string
          default_gst_pct?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          is_deleted?: boolean
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
          business_name?: string
          business_type?: string | null
          city?: string | null
          composition_scheme?: boolean
          created_at?: string
          default_gst_pct?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          is_deleted?: boolean
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
          business_id?: string | null
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
          business_id?: string | null
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
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
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
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
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
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
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
      dealer_documents: {
        Row: {
          application_id: string
          business_id: string
          created_at: string
          doc_type: string
          file_name: string | null
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          user_id: string
        }
        Insert: {
          application_id: string
          business_id: string
          created_at?: string
          doc_type: string
          file_name?: string | null
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id: string
        }
        Update: {
          application_id?: string
          business_id?: string
          created_at?: string
          doc_type?: string
          file_name?: string | null
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "dealer_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_documents_business_id_fkey"
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
      dispatch_items: {
        Row: {
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
          box_count: number | null
          business_id: string | null
          case_count: number | null
          created_at: string
          dispatch_date: string
          dispatch_number: string
          dispatch_remarks: string | null
          eway_number: string | null
          id: string
          lr_number: string | null
          notes: string | null
          order_id: string
          packing_remarks: string | null
          packing_slip_number: string | null
          party_id: string | null
          transporter: string | null
          updated_at: string
          user_id: string
          vehicle_number: string | null
        }
        Insert: {
          box_count?: number | null
          business_id?: string | null
          case_count?: number | null
          created_at?: string
          dispatch_date?: string
          dispatch_number: string
          dispatch_remarks?: string | null
          eway_number?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          order_id: string
          packing_remarks?: string | null
          packing_slip_number?: string | null
          party_id?: string | null
          transporter?: string | null
          updated_at?: string
          user_id: string
          vehicle_number?: string | null
        }
        Update: {
          box_count?: number | null
          business_id?: string | null
          case_count?: number | null
          created_at?: string
          dispatch_date?: string
          dispatch_number?: string
          dispatch_remarks?: string | null
          eway_number?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          order_id?: string
          packing_remarks?: string | null
          packing_slip_number?: string | null
          party_id?: string | null
          transporter?: string | null
          updated_at?: string
          user_id?: string
          vehicle_number?: string | null
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
      goods_receipt_items: {
        Row: {
          accepted_qty: number
          created_at: string
          damaged_qty: number
          goods_receipt_id: string
          id: string
          ordered_qty: number
          pending_qty: number
          product_id: string | null
          purchase_order_item_id: string | null
          received_qty: number
        }
        Insert: {
          accepted_qty?: number
          created_at?: string
          damaged_qty?: number
          goods_receipt_id: string
          id?: string
          ordered_qty?: number
          pending_qty?: number
          product_id?: string | null
          purchase_order_item_id?: string | null
          received_qty?: number
        }
        Update: {
          accepted_qty?: number
          created_at?: string
          damaged_qty?: number
          goods_receipt_id?: string
          id?: string
          ordered_qty?: number
          pending_qty?: number
          product_id?: string | null
          purchase_order_item_id?: string | null
          received_qty?: number
        }
        Relationships: [
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
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
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
          supplier_id: string | null
          updated_at: string
          warehouse_id: string | null
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
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
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
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
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
      inventory_adjustments: {
        Row: {
          business_id: string | null
          created_at: string
          delta: number
          id: string
          product_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          delta: number
          id?: string
          product_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
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
          stock_after?: number
          stock_before?: number
          user_id?: string
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
          approved_at: string | null
          approved_by: string | null
          billing_address: string | null
          business_id: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          cd_total: number
          created_at: string
          deleted_at: string | null
          delivery_address: string | null
          discount_total: number
          dispatched_total_qty: number
          eway_number: string | null
          grand_total: number
          gst_total: number
          id: string
          invoice_id: string | null
          invoiced_at: string | null
          last_dispatch_date: string | null
          lr_number: string | null
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
          source_channel: string | null
          source_type: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          transporter: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          vehicle_number: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billing_address?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cd_total?: number
          created_at?: string
          deleted_at?: string | null
          delivery_address?: string | null
          discount_total?: number
          dispatched_total_qty?: number
          eway_number?: string | null
          grand_total?: number
          gst_total?: number
          id?: string
          invoice_id?: string | null
          invoiced_at?: string | null
          last_dispatch_date?: string | null
          lr_number?: string | null
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
          source_channel?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          transporter?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          vehicle_number?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billing_address?: string | null
          business_id?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cd_total?: number
          created_at?: string
          deleted_at?: string | null
          delivery_address?: string | null
          discount_total?: number
          dispatched_total_qty?: number
          eway_number?: string | null
          grand_total?: number
          gst_total?: number
          id?: string
          invoice_id?: string | null
          invoiced_at?: string | null
          last_dispatch_date?: string | null
          lr_number?: string | null
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
          source_channel?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          transporter?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          vehicle_number?: string | null
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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
          business_id: string | null
          created_at: string
          discount: number
          id: string
          party_id: string
          segment_id: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          discount?: number
          id?: string
          party_id: string
          segment_id: string
          user_id: string
        }
        Update: {
          business_id?: string | null
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
      products: {
        Row: {
          barcode: string | null
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
      purchase_invoice_items: {
        Row: {
          created_at: string
          description: string | null
          discount_percent: number
          gst_percent: number
          id: string
          part_number: string
          position: number
          product_id: string | null
          purchase_invoice_id: string
          qty: number
          rate: number
          tax_amount: number
          taxable_amount: number
          total_amount: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          gst_percent?: number
          id?: string
          part_number?: string
          position?: number
          product_id?: string | null
          purchase_invoice_id: string
          qty?: number
          rate?: number
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          gst_percent?: number
          id?: string
          part_number?: string
          position?: number
          product_id?: string | null
          purchase_invoice_id?: string
          qty?: number
          rate?: number
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
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
          business_id: string
          created_at: string
          created_by: string | null
          discount_total: number
          due_date: string | null
          goods_receipt_id: string | null
          grand_total: number
          id: string
          invoice_date: string
          invoice_number: string
          paid_amount: number
          purchase_order_id: string | null
          remarks: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          supplier_invoice_number: string | null
          tax_total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          discount_total?: number
          due_date?: string | null
          goods_receipt_id?: string | null
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          paid_amount?: number
          purchase_order_id?: string | null
          remarks?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          tax_total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          discount_total?: number
          due_date?: string | null
          goods_receipt_id?: string | null
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          paid_amount?: number
          purchase_order_id?: string | null
          remarks?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          tax_total?: number
          updated_at?: string
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
          created_at: string
          description: string | null
          discount_percent: number
          gst_percent: number
          id: string
          part_number: string
          position: number
          product_id: string | null
          purchase_order_id: string
          qty: number
          rate: number
          tax_amount: number
          taxable_amount: number
          total_amount: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          gst_percent?: number
          id?: string
          part_number?: string
          position?: number
          product_id?: string | null
          purchase_order_id: string
          qty?: number
          rate?: number
          tax_amount?: number
          taxable_amount?: number
          total_amount?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percent?: number
          gst_percent?: number
          id?: string
          part_number?: string
          position?: number
          product_id?: string | null
          purchase_order_id?: string
          qty?: number
          rate?: number
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
          created_by: string | null
          discount_total: number
          expected_delivery_date: string | null
          grand_total: number
          id: string
          po_date: string
          po_number: string
          remarks: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax_total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          discount_total?: number
          expected_delivery_date?: string | null
          grand_total?: number
          id?: string
          po_date?: string
          po_number: string
          remarks?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          discount_total?: number
          expected_delivery_date?: string | null
          grand_total?: number
          id?: string
          po_date?: string
          po_number?: string
          remarks?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          updated_at?: string
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
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_config: {
        Row: {
          business_id: string
          created_at: string
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
          id: string
          stock_reduction_point: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
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
          id?: string
          stock_reduction_point?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
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
          id?: string
          stock_reduction_point?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_invoice_items: {
        Row: {
          business_id: string | null
          created_at: string
          description: string | null
          discount_pct: number
          gst_pct: number
          id: string
          invoice_id: string
          mrp: number
          net_rate: number
          part_number: string | null
          position: number
          product_id: string | null
          qty: number
          rate: number
          total: number
          user_id: string
          vehicle_model: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          description?: string | null
          discount_pct?: number
          gst_pct?: number
          id?: string
          invoice_id: string
          mrp?: number
          net_rate?: number
          part_number?: string | null
          position?: number
          product_id?: string | null
          qty?: number
          rate?: number
          total?: number
          user_id: string
          vehicle_model?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          description?: string | null
          discount_pct?: number
          gst_pct?: number
          id?: string
          invoice_id?: string
          mrp?: number
          net_rate?: number
          part_number?: string | null
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
          created_at: string
          discount_total: number
          grand_total: number
          gst_total: number
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_id: string | null
          party_id: string | null
          party_name: string | null
          party_snapshot: Json | null
          remarks: string | null
          salesman: string | null
          shipping_address: string | null
          shipping_charges: number
          status: string
          subtotal: number
          updated_at: string
          user_id: string
          voucher_id: string | null
        }
        Insert: {
          billing_address?: string | null
          business_id?: string | null
          created_at?: string
          discount_total?: number
          grand_total?: number
          gst_total?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          order_id?: string | null
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          remarks?: string | null
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number
          status?: string
          subtotal?: number
          updated_at?: string
          user_id: string
          voucher_id?: string | null
        }
        Update: {
          billing_address?: string | null
          business_id?: string | null
          created_at?: string
          discount_total?: number
          grand_total?: number
          gst_total?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string | null
          party_id?: string | null
          party_name?: string | null
          party_snapshot?: Json | null
          remarks?: string | null
          salesman?: string | null
          shipping_address?: string | null
          shipping_charges?: number
          status?: string
          subtotal?: number
          updated_at?: string
          user_id?: string
          voucher_id?: string | null
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
      voucher_items: {
        Row: {
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
      warehouses: {
        Row: {
          address: string | null
          business_id: string
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _user_default_business: { Args: { _user_id: string }; Returns: string }
      approve_dealer_application: { Args: { _app_id: string }; Returns: string }
      archive_business: { Args: { _business_id: string }; Returns: undefined }
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
      business_transaction_count: {
        Args: { _business_id: string }
        Returns: number
      }
      cancel_permanent_delete: {
        Args: { _business_id: string }
        Returns: undefined
      }
      current_business_id: { Args: never; Returns: string }
      ensure_party_ledger:
        | { Args: { _party_id: string; _user_id: string }; Returns: string }
        | {
            Args: { _business_id?: string; _party_id: string; _user_id: string }
            Returns: string
          }
      execute_permanent_delete: {
        Args: { _business_id: string }
        Returns: undefined
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
      next_grn_number: { Args: { _business_id: string }; Returns: string }
      next_invoice_number: { Args: { _user_id: string }; Returns: string }
      next_order_number: { Args: { _user_id: string }; Returns: string }
      next_packing_slip_number: { Args: { _user_id: string }; Returns: string }
      next_po_number: { Args: { _business_id: string }; Returns: string }
      next_purchase_invoice_number: {
        Args: { _business_id: string }
        Returns: string
      }
      next_supplier_payment_ref: {
        Args: { _business_id: string }
        Returns: string
      }
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
      reject_dealer_application: {
        Args: { _app_id: string; _notes?: string }
        Returns: undefined
      }
      request_permanent_delete: {
        Args: { _business_id: string; _reason?: string }
        Returns: string
      }
      restore_business: { Args: { _business_id: string }; Returns: undefined }
      role_rank: {
        Args: { _role: Database["public"]["Enums"]["business_role"] }
        Returns: number
      }
      seed_accounting_defaults:
        | { Args: { _user_id: string }; Returns: undefined }
        | {
            Args: { _business_id?: string; _user_id: string }
            Returns: undefined
          }
      soft_delete_business: {
        Args: { _business_id: string; _reason?: string }
        Returns: undefined
      }
      unarchive_business: { Args: { _business_id: string }; Returns: undefined }
      user_business_role: {
        Args: { _business_id: string }
        Returns: Database["public"]["Enums"]["business_role"]
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
        | "salesman"
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
        | "approved"
        | "invoiced"
        | "closed"
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
        "salesman",
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
        "approved",
        "invoiced",
        "closed",
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
