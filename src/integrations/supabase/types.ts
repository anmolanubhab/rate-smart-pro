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
