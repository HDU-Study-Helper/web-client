export interface User {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'user'
}

export interface Source {
  source: string
  name: string
  qr_login: boolean
  password_login?: boolean
  resources: string[]
}

export interface Connection {
  id: string
  user_id: string
  source?: string
  state: string
  enabled: boolean
}

export interface PlatformAuth {
  status: string
  expires_at: string
  poll_after_ms?: number
  qr_image?: string
  qr_url?: string
}

export interface DWSAuth {
  id: string
  connection_id: string
  status: string
  verification_uri?: string
  user_code?: string
  expires_at: string
  error_code?: string
}

export interface Group {
  id: string
  name: string
}
export interface Period {
  period: number
  start: string
  end: string
}
export interface SetupDraft {
  version: 1
  step: number
  academicYear: number
  term: number
  monday: string
  periods: Period[]
  completed: boolean
  importResult?: ImportResult
}
export interface ImportResult {
  academic_year: number
  term: number
  records: number
  generated: number
  skipped_practice: number
  retired_modifications: string[]
}
