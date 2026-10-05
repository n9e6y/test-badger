// Mirrors backend Pydantic schemas (backend/app/schemas). Keep in sync.

export interface User {
  id: string
  email: string
  name: string
}

export interface SignupInput {
  name: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}
