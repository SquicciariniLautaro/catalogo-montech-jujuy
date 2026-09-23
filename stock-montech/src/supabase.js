import { createClient } from '@supabase/supabase-js'

// Supabase
const supabaseUrl = 'https://ievyjsjyrsupcldyryti.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlldnlqc2p5cnN1cGNsZHlyeXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMDI3NjIsImV4cCI6MjEwNTY3ODc2Mn0.fKHJyLZ1WCSUvBUUTrJi-M5RxgZm6DuFT2V9EpQWMoU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)