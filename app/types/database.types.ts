export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      stock_holdings: {
        Row: {
          id: number
          stock_code: string
          stock_name: string
          shares: number
          average_cost: number
          buy_date: string
          leverage_multiplier: number
          watermark_price: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['stock_holdings']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['stock_holdings']['Insert']>
      }
      portfolio_settings: {
        Row: {
          id: number
          birth_year: number
          cash_amount: number
          target_beta: number
          initial_amount: number
          annual_contribution: number
          stop_contribution_year: number
          expected_annual_return: number
        }
        Insert: Omit<Database['public']['Tables']['portfolio_settings']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['portfolio_settings']['Insert']>
      }
    }
  }
}
