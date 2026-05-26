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
      allocation_rules: {
        Row: {
          applies_to: string | null
          created_at: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean | null
          percentage: number | null
          rule_type: Database["public"]["Enums"]["allocation_rule_type"]
          updated_at: string | null
          user_id: string
          vault_id: string
        }
        Insert: {
          applies_to?: string | null
          created_at?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean | null
          percentage?: number | null
          rule_type: Database["public"]["Enums"]["allocation_rule_type"]
          updated_at?: string | null
          user_id: string
          vault_id: string
        }
        Update: {
          applies_to?: string | null
          created_at?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean | null
          percentage?: number | null
          rule_type?: Database["public"]["Enums"]["allocation_rule_type"]
          updated_at?: string | null
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rules_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          available_balance: number | null
          created_at: string | null
          current_balance: number | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          last_synced_at: string | null
          mask: string | null
          name: string
          official_name: string | null
          plaid_account_id: string
          plaid_item_id: string
          subtype: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_balance?: number | null
          created_at?: string | null
          current_balance?: number | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_synced_at?: string | null
          mask?: string | null
          name: string
          official_name?: string | null
          plaid_account_id: string
          plaid_item_id: string
          subtype?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_balance?: number | null
          created_at?: string | null
          current_balance?: number | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_synced_at?: string | null
          mask?: string | null
          name?: string
          official_name?: string | null
          plaid_account_id?: string
          plaid_item_id?: string
          subtype?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_plaid_item_id_fkey"
            columns: ["plaid_item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          color: string | null
          created_at: string | null
          current_amount: number | null
          description: string | null
          emoji: string | null
          id: string
          is_shared: boolean | null
          name: string
          priority: number | null
          status: Database["public"]["Enums"]["goal_status"] | null
          target_amount: number
          target_date: string | null
          updated_at: string | null
          user_id: string
          vault_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          current_amount?: number | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_shared?: boolean | null
          name: string
          priority?: number | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_amount: number
          target_date?: string | null
          updated_at?: string | null
          user_id: string
          vault_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          current_amount?: number | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_shared?: boolean | null
          name?: string
          priority?: number | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_amount?: number
          target_date?: string | null
          updated_at?: string | null
          user_id?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      income_events: {
        Row: {
          created_at: string | null
          distributed_at: string | null
          distribution_log: Json | null
          gross_amount: number
          id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          distributed_at?: string | null
          distribution_log?: Json | null
          gross_amount: number
          id?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          distributed_at?: string | null
          distribution_log?: Json | null
          gross_amount?: number
          id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string | null
          default_category: string | null
          default_subcategory: string | null
          default_vault_category:
            | Database["public"]["Enums"]["vault_category"]
            | null
          display_name: string
          id: string
          logo_url: string | null
          mcc: string | null
          raw_name_patterns: string[] | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_category?: string | null
          default_subcategory?: string | null
          default_vault_category?:
            | Database["public"]["Enums"]["vault_category"]
            | null
          display_name: string
          id?: string
          logo_url?: string | null
          mcc?: string | null
          raw_name_patterns?: string[] | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_category?: string | null
          default_subcategory?: string | null
          default_vault_category?:
            | Database["public"]["Enums"]["vault_category"]
            | null
          display_name?: string
          id?: string
          logo_url?: string | null
          mcc?: string | null
          raw_name_patterns?: string[] | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      plaid_items: {
        Row: {
          created_at: string | null
          cursor: string | null
          id: string
          institution_color: string | null
          institution_id: string | null
          institution_logo: string | null
          institution_name: string | null
          is_active: boolean | null
          last_synced_at: string | null
          plaid_access_token: string
          plaid_item_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          cursor?: string | null
          id?: string
          institution_color?: string | null
          institution_id?: string | null
          institution_logo?: string | null
          institution_name?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          plaid_access_token: string
          plaid_item_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          cursor?: string | null
          id?: string
          institution_color?: string | null
          institution_id?: string | null
          institution_logo?: string | null
          institution_name?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          plaid_access_token?: string
          plaid_item_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          budget_style: Database["public"]["Enums"]["budget_style"] | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          income_frequency:
            | Database["public"]["Enums"]["income_frequency"]
            | null
          monthly_income: number | null
          notification_tone:
            | Database["public"]["Enums"]["notification_tone"]
            | null
          onboarding_complete: boolean | null
          onboarding_step: number | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          budget_style?: Database["public"]["Enums"]["budget_style"] | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          income_frequency?:
            | Database["public"]["Enums"]["income_frequency"]
            | null
          monthly_income?: number | null
          notification_tone?:
            | Database["public"]["Enums"]["notification_tone"]
            | null
          onboarding_complete?: boolean | null
          onboarding_step?: number | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          budget_style?: Database["public"]["Enums"]["budget_style"] | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          income_frequency?:
            | Database["public"]["Enums"]["income_frequency"]
            | null
          monthly_income?: number | null
          notification_tone?:
            | Database["public"]["Enums"]["notification_tone"]
            | null
          onboarding_complete?: boolean | null
          onboarding_step?: number | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: string | null
          created_at: string | null
          currency: string | null
          date: string
          description: string | null
          id: string
          is_income: boolean | null
          is_pending: boolean | null
          is_transfer: boolean | null
          maslo_decision_reason: string | null
          merchant_id: string | null
          merchant_name: string | null
          plaid_transaction_id: string | null
          posted_at: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          subcategory: string | null
          updated_at: string | null
          user_id: string
          vault_id: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          date: string
          description?: string | null
          id?: string
          is_income?: boolean | null
          is_pending?: boolean | null
          is_transfer?: boolean | null
          maslo_decision_reason?: string | null
          merchant_id?: string | null
          merchant_name?: string | null
          plaid_transaction_id?: string | null
          posted_at?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          subcategory?: string | null
          updated_at?: string | null
          user_id: string
          vault_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          description?: string | null
          id?: string
          is_income?: boolean | null
          is_pending?: boolean | null
          is_transfer?: boolean | null
          maslo_decision_reason?: string | null
          merchant_id?: string | null
          merchant_name?: string | null
          plaid_transaction_id?: string | null
          posted_at?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          subcategory?: string | null
          updated_at?: string | null
          user_id?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      user_merchant_rules: {
        Row: {
          category_override: string | null
          created_at: string | null
          id: string
          merchant_id: string | null
          raw_description: string | null
          updated_at: string | null
          user_id: string
          vault_id: string
        }
        Insert: {
          category_override?: string | null
          created_at?: string | null
          id?: string
          merchant_id?: string | null
          raw_description?: string | null
          updated_at?: string | null
          user_id: string
          vault_id: string
        }
        Update: {
          category_override?: string | null
          created_at?: string | null
          id?: string
          merchant_id?: string | null
          raw_description?: string | null
          updated_at?: string | null
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_merchant_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_merchant_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_merchant_rules_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          note: string | null
          transaction_id: string | null
          user_id: string
          vault_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          note?: string | null
          transaction_id?: string | null
          user_id: string
          vault_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          note?: string | null
          transaction_id?: string | null
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_ledger_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          autopay_enabled: boolean | null
          category: Database["public"]["Enums"]["vault_category"]
          color: string | null
          created_at: string | null
          current_balance: number | null
          description: string | null
          due_amount: number | null
          due_day: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          linked_account_id: string | null
          lock_type: Database["public"]["Enums"]["lock_type"] | null
          name: string
          priority: number
          target_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          autopay_enabled?: boolean | null
          category: Database["public"]["Enums"]["vault_category"]
          color?: string | null
          created_at?: string | null
          current_balance?: number | null
          description?: string | null
          due_amount?: number | null
          due_day?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          linked_account_id?: string | null
          lock_type?: Database["public"]["Enums"]["lock_type"] | null
          name: string
          priority: number
          target_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          autopay_enabled?: boolean | null
          category?: Database["public"]["Enums"]["vault_category"]
          color?: string | null
          created_at?: string | null
          current_balance?: number | null
          description?: string | null
          due_amount?: number | null
          due_day?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          linked_account_id?: string | null
          lock_type?: Database["public"]["Enums"]["lock_type"] | null
          name?: string
          priority?: number
          target_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaults_linked_account_id_fkey"
            columns: ["linked_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaults_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      account_type:
        | "checking"
        | "savings"
        | "credit"
        | "loan"
        | "investment"
        | "other"
      allocation_rule_type: "percentage" | "fixed" | "remainder"
      budget_style: "liberal" | "moderate" | "aggressive"
      goal_status: "active" | "completed" | "paused" | "cancelled"
      income_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly"
      ledger_entry_type:
        | "allocation"
        | "spend"
        | "transfer"
        | "adjustment"
        | "income_distribution"
      lock_type: "hard_lock" | "soft_lock" | "flexible"
      notification_tone: "gentle" | "sarcastic" | "drill_sergeant" | "shaman"
      transaction_status:
        | "approved"
        | "warned"
        | "denied"
        | "pending"
        | "uncategorized"
      vault_category: "essentials" | "debt" | "future" | "lifestyle"
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
      account_type: [
        "checking",
        "savings",
        "credit",
        "loan",
        "investment",
        "other",
      ],
      allocation_rule_type: ["percentage", "fixed", "remainder"],
      budget_style: ["liberal", "moderate", "aggressive"],
      goal_status: ["active", "completed", "paused", "cancelled"],
      income_frequency: ["weekly", "biweekly", "semimonthly", "monthly"],
      ledger_entry_type: [
        "allocation",
        "spend",
        "transfer",
        "adjustment",
        "income_distribution",
      ],
      lock_type: ["hard_lock", "soft_lock", "flexible"],
      notification_tone: ["gentle", "sarcastic", "drill_sergeant", "shaman"],
      transaction_status: [
        "approved",
        "warned",
        "denied",
        "pending",
        "uncategorized",
      ],
      vault_category: ["essentials", "debt", "future", "lifestyle"],
    },
  },
} as const
