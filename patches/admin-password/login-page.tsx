export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { ShieldCheckIcon } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { getOptionalAppUser } from "@/lib/admin/auth"
import { hasSupabaseAuthEnv } from "@/lib/admin/env"

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (await getOptionalAppUser()) redirect("/dashboard")
  const params = await searchParams
  const error = Array.isArray(params.error) ? params.error[0] : params.error
  const ready = hasSupabaseAuthEnv()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-4" />
          </div>
          check-cx Admin
        </div>
        <LoginForm authEnvReady={ready} errorMessage={!ready ? "登录服务尚未配置。" : error ? "账号或密码错误，或该账号无后台访问权限。" : undefined} />
      </div>
    </div>
  )
}
