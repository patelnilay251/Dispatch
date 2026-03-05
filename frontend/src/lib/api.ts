import { supabase } from "./supabase"

/**
 * Make an authenticated API call to the backend.
 * Automatically attaches the Supabase JWT.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return fetch(`/api${path}`, { ...options, headers })
}
