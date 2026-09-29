import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"

export function LoginForm({
  className, errorMessage, authEnvReady, ...props
}: React.ComponentProps<"div"> & { errorMessage?: string; authEnvReady: boolean }) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">登录后台</CardTitle>
          <CardDescription>使用管理员配置的邮箱账号和密码登录。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/sign-in" method="post">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">邮箱账号</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="username" required disabled={!authEnvReady} />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input id="password" name="password" type="password" autoComplete="current-password" required disabled={!authEnvReady} />
              </Field>
              <Button type="submit" disabled={!authEnvReady}>登录</Button>
              {errorMessage ? <FieldDescription role="alert" className="text-destructive">{errorMessage}</FieldDescription> : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
