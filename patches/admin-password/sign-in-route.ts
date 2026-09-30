import { NextResponse } from "next/server"
import { resolveAppUserFromIdentity } from "@/lib/admin/auth"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const form = await request.formData()
  const email = form.get("email")
  const password = form.get("password")
  // Relative redirects preserve the browser's host, scheme, and port behind proxies.
  const failed = () => new NextResponse(null, { status: 303, headers: { Location: "/login?error=credentials" } })
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return failed()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.user) return failed()
  if (!await resolveAppUserFromIdentity(data.user)) {
    await supabase.auth.signOut()
    return failed()
  }
  return new NextResponse(null, { status: 303, headers: { Location: "/dashboard" } })
}
