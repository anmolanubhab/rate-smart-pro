export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ledger_accounts: {
        Row: {
          business_id: string | null
          created_at: string
          group_id: string | null
          id: string
          is_system: boolean
          ledger_type: string
          name: string
          opening_balance: number
          opening_balance_type: string
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
          ledger_type: string
          name: string
          opening_balance?: number
          opening_balance_type?: string
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
          ledger_type?: string
          name?: string
          opening_balance?: number
          opening_balance_type?: string
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
      vouchers: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          narration: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          voucher_date: string
          voucher_number: string
          voucher_type: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          voucher_date: string
          voucher_number: string
          voucher_type: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          narration?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          voucher_date?: string
          voucher_number?: string
          voucher_type?: string
        }
        Relationships: []
      }
      voucher_items: {
        Row: {
          business_id: string | null
          cr_amount: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_accounting_defaults: {
        Args: {
          _user_id: string
          _business_id: string | null
        }
        Returns: undefined
      }
      ensure_party_ledger: {
        Args: {
          _user_id: string
          _party_id: string
          _business_id: string | null
        }
        Returns: string
      }
    }
    Enums: {
      account_nature: "asset" | "liability" | "income" | "expense" | "equity"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
