import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function handleSignOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } })
}

export async function GET() {
  return handleSignOut()
}

export async function POST() {
  return handleSignOut()
}
