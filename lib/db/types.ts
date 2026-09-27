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
      booking_events: {
        Row: {
          actor: Database["public"]["Enums"]["booking_event_actor"]
          actor_user_id: string | null
          booking_id: string
          created_at: string
          event_type: string
          id: string
          new_value: string | null
          old_value: string | null
          payload: Json | null
        }
        Insert: {
          actor?: Database["public"]["Enums"]["booking_event_actor"]
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          payload?: Json | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["booking_event_actor"]
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_number: number
          created_at: string
          customer_id: string
          daily_price_rs: number | null
          document_status: Database["public"]["Enums"]["document_status"]
          dropoff_location_id: string | null
          extras_rs: number
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pickup_at: string | null
          pickup_location_id: string | null
          rental_days: number | null
          return_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          total_rs: number | null
          updated_at: string
          upload_token: string | null
          upload_token_expires_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          booking_number?: number
          created_at?: string
          customer_id: string
          daily_price_rs?: number | null
          document_status?: Database["public"]["Enums"]["document_status"]
          dropoff_location_id?: string | null
          extras_rs?: number
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_at?: string | null
          pickup_location_id?: string | null
          rental_days?: number | null
          return_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_rs?: number | null
          updated_at?: string
          upload_token?: string | null
          upload_token_expires_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          booking_number?: number
          created_at?: string
          customer_id?: string
          daily_price_rs?: number | null
          document_status?: Database["public"]["Enums"]["document_status"]
          dropoff_location_id?: string | null
          extras_rs?: number
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_at?: string | null
          pickup_location_id?: string | null
          rental_days?: number | null
          return_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_rs?: number | null
          updated_at?: string
          upload_token?: string | null
          upload_token_expires_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_dropoff_location_id_fkey"
            columns: ["dropoff_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          customer_id: string
          id: string
          last_message_at: string | null
          mode: Database["public"]["Enums"]["conversation_mode"]
          state: Json
          taken_over_at: string | null
          taken_over_by: string | null
        }
        Insert: {
          customer_id: string
          id?: string
          last_message_at?: string | null
          mode?: Database["public"]["Enums"]["conversation_mode"]
          state?: Json
          taken_over_at?: string | null
          taken_over_by?: string | null
        }
        Update: {
          customer_id?: string
          id?: string
          last_message_at?: string | null
          mode?: Database["public"]["Enums"]["conversation_mode"]
          state?: Json
          taken_over_at?: string | null
          taken_over_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_taken_over_by_fkey"
            columns: ["taken_over_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          customer_code: string
          email: string | null
          full_name: string | null
          id: string
          notes: string | null
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          created_at?: string
          customer_code?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          created_at?: string
          customer_code?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      document_verifications: {
        Row: {
          confidence: number | null
          created_at: string
          detected_doc_type: Database["public"]["Enums"]["doc_type"] | null
          document_id: string
          document_number: string | null
          expiry_date: string | null
          extracted_dob: string | null
          extracted_name: string | null
          id: string
          name_match_score: number | null
          reasons: string[]
          result: Database["public"]["Enums"]["verification_result"]
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          detected_doc_type?: Database["public"]["Enums"]["doc_type"] | null
          document_id: string
          document_number?: string | null
          expiry_date?: string | null
          extracted_dob?: string | null
          extracted_name?: string | null
          id?: string
          name_match_score?: number | null
          reasons?: string[]
          result: Database["public"]["Enums"]["verification_result"]
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          detected_doc_type?: Database["public"]["Enums"]["doc_type"] | null
          document_id?: string
          document_number?: string | null
          expiry_date?: string | null
          extracted_dob?: string | null
          extracted_name?: string | null
          id?: string
          name_match_score?: number | null
          reasons?: string[]
          result?: Database["public"]["Enums"]["verification_result"]
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_verifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          booking_id: string
          customer_id: string
          deleted_at: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          id: string
          mime_type: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          booking_id: string
          customer_id: string
          deleted_at?: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          id?: string
          mime_type: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          booking_id?: string
          customer_id?: string
          deleted_at?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          active: boolean
          answer: string
          id: string
          question: string
          search_vector: unknown
          topic: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          answer: string
          id?: string
          question: string
          search_vector?: unknown
          topic: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          answer?: string
          id?: string
          question?: string
          search_vector?: unknown
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          active: boolean
          extra_fee_rs: number
          google_maps_url: string | null
          id: string
          instructions: string | null
          is_dropoff: boolean
          is_pickup: boolean
          name: string
          opening_hours: Json | null
        }
        Insert: {
          active?: boolean
          extra_fee_rs?: number
          google_maps_url?: string | null
          id?: string
          instructions?: string | null
          is_dropoff?: boolean
          is_pickup?: boolean
          name: string
          opening_hours?: Json | null
        }
        Update: {
          active?: boolean
          extra_fee_rs?: number
          google_maps_url?: string | null
          id?: string
          instructions?: string | null
          is_dropoff?: boolean
          is_pickup?: boolean
          name?: string
          opening_hours?: Json | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          sender: Database["public"]["Enums"]["message_sender"]
          whatsapp_message_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          sender: Database["public"]["Enums"]["message_sender"]
          whatsapp_message_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          sender?: Database["public"]["Enums"]["message_sender"]
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_notifications: {
        Row: {
          body: string | null
          booking_id: string | null
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["owner_notification_status"]
          title: string
          type: Database["public"]["Enums"]["owner_notification_type"]
        }
        Insert: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["owner_notification_status"]
          title: string
          type: Database["public"]["Enums"]["owner_notification_type"]
        }
        Update: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["owner_notification_status"]
          title?: string
          type?: Database["public"]["Enums"]["owner_notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "owner_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_notifications_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_rs: number
          booking_id: string
          id: string
          marked_paid_at: string
          marked_paid_by: string
          method: Database["public"]["Enums"]["payment_method"]
        }
        Insert: {
          amount_rs: number
          booking_id: string
          id?: string
          marked_paid_at?: string
          marked_paid_by: string
          method?: Database["public"]["Enums"]["payment_method"]
        }
        Update: {
          amount_rs?: number
          booking_id?: string
          id?: string
          marked_paid_at?: string
          marked_paid_by?: string
          method?: Database["public"]["Enums"]["payment_method"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: []
      }
      vehicle_categories: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          category_id: string
          created_at: string
          daily_price_rs: number
          home_location_id: string | null
          id: string
          make: string
          model: string
          photo_url: string | null
          registration: string
          seats: number | null
          status: Database["public"]["Enums"]["vehicle_status"]
          transmission: string | null
          vehicle_code: string
        }
        Insert: {
          category_id: string
          created_at?: string
          daily_price_rs: number
          home_location_id?: string | null
          id?: string
          make: string
          model: string
          photo_url?: string | null
          registration: string
          seats?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: string | null
          vehicle_code?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          daily_price_rs?: number
          home_location_id?: string | null
          id?: string
          make?: string
          model?: string
          photo_url?: string | null
          registration?: string
          seats?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: string | null
          vehicle_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_home_location_id_fkey"
            columns: ["home_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_booking_event_actor: {
        Args: never
        Returns: Database["public"]["Enums"]["booking_event_actor"]
      }
      current_booking_event_actor_user_id: { Args: never; Returns: string }
      is_active_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      booking_event_actor: "ai" | "owner" | "customer" | "system"
      booking_status:
        | "ENQUIRY"
        | "CAR_SELECTED"
        | "DATES_SELECTED"
        | "PENDING_DOCUMENTS"
        | "DOCUMENTS_VERIFIED"
        | "CONFIRMED"
        | "PICKED_UP"
        | "RETURNED"
        | "COMPLETED"
        | "CANCELLED"
        | "NEEDS_HUMAN"
      conversation_mode: "AI" | "HUMAN"
      doc_type: "PASSPORT" | "DRIVING_PERMIT"
      document_status:
        | "NOT_SUBMITTED"
        | "PENDING"
        | "VERIFIED"
        | "NEEDS_REVIEW"
        | "REJECTED"
      message_direction: "INBOUND" | "OUTBOUND"
      message_sender: "customer" | "ai" | "owner"
      owner_notification_status: "OPEN" | "RESOLVED"
      owner_notification_type:
        | "DELAY"
        | "PICKUP_CHANGE"
        | "EXTENSION_REQUEST"
        | "NEEDS_HUMAN"
        | "DOC_REVIEW"
        | "CASH_ISSUE"
      payment_method: "CASH"
      payment_status: "UNPAID" | "PAID" | "REFUNDED"
      staff_role: "OWNER" | "STAFF"
      vehicle_status: "ACTIVE" | "MAINTENANCE" | "RETIRED"
      verification_result: "VERIFIED" | "NEEDS_REVIEW"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      booking_event_actor: ["ai", "owner", "customer", "system"],
      booking_status: [
        "ENQUIRY",
        "CAR_SELECTED",
        "DATES_SELECTED",
        "PENDING_DOCUMENTS",
        "DOCUMENTS_VERIFIED",
        "CONFIRMED",
        "PICKED_UP",
        "RETURNED",
        "COMPLETED",
        "CANCELLED",
        "NEEDS_HUMAN",
      ],
      conversation_mode: ["AI", "HUMAN"],
      doc_type: ["PASSPORT", "DRIVING_PERMIT"],
      document_status: [
        "NOT_SUBMITTED",
        "PENDING",
        "VERIFIED",
        "NEEDS_REVIEW",
        "REJECTED",
      ],
      message_direction: ["INBOUND", "OUTBOUND"],
      message_sender: ["customer", "ai", "owner"],
      owner_notification_status: ["OPEN", "RESOLVED"],
      owner_notification_type: [
        "DELAY",
        "PICKUP_CHANGE",
        "EXTENSION_REQUEST",
        "NEEDS_HUMAN",
        "DOC_REVIEW",
        "CASH_ISSUE",
      ],
      payment_method: ["CASH"],
      payment_status: ["UNPAID", "PAID", "REFUNDED"],
      staff_role: ["OWNER", "STAFF"],
      vehicle_status: ["ACTIVE", "MAINTENANCE", "RETIRED"],
      verification_result: ["VERIFIED", "NEEDS_REVIEW"],
    },
  },
} as const
