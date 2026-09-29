import { NextResponse } from "next/server"
import { resolveAppUserFromIdentity } from "@/lib/admin/auth"
import { getRequestOrigin } from "@/lib/admin/env"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const origin = getRequestOrigin(request)
  // Reject cross-site login submissions; APP_URL must match the browser's origin.
  if (request.headers.get("origin") !== new URL(origin).origin) {
    return new NextResponse("Invalid request origin", { status: 403 })
  }
  const form = await request.formData()
  const email = form.get("email")
  const password = form.get("password")
  const failed = () => NextResponse.redirect(new URL("/login?error=credentials", origin), 303)
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return failed()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.user) return failed()
  if (!await resolveAppUserFromIdentity(data.user)) {
    await supabase.auth.signOut()
    return failed()
  }
  return NextResponse.redirect(new URL("/dashboard", origin), 303)
}
