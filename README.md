# check-cx Docker Image

本仓库自动构建并发布 `BingZi-233/check-cx` 与 `BingZi-233/check-cx-admin` 的单容器镜像：

```text
ghcr.io/blissky/check-cx
```

一个容器内运行监控面板、管理后台、PostgreSQL 17、PostgREST 和 Supabase Auth，通过邮箱账号和密码登录后台，不需要 GitHub OAuth。源码在构建时从上游指定提交获取，不复制进本仓库。`patches/admin-password` 为上游管理后台加入本地密码登录，保留其允许名单和角色检查。当前支持 `linux/amd64`。

这里没有打包 Supabase Studio、Storage、Realtime、Edge Functions 和日志平台；当前两个应用所需的是数据库、REST 与 Auth。它不是完整 Supabase 平台的替代品。

## 快速部署

在安装 Docker Engine 和 Docker Compose v2 的 Linux 主机上，先编辑 `docker-compose.yml` 的 `environment`，填写管理员账号和密码：

```yaml
environment:
  ADMIN_EMAIL: "admin@example.com"
  ADMIN_PASSWORD: "替换为至少12个字符的强密码"
```

账号使用邮箱格式，仅作为本地账号标识，不要求配置邮箱服务。仓库中的密码默认留空，未填写时容器会报错退出。后台支持通过不同域名、IP 和端口访问，无需配置 `APP_URL`。远程直接访问后台时，将 `ports` 中的 `127.0.0.1:3001:3001` 改为 `0.0.0.0:3001:3001`；推荐生产环境通过 HTTPS 反向代理访问。

然后执行：

```bash
mkdir -p data
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f --tail=100
```

首次启动自动生成内部数据库密码与 JWT 密钥、初始化数据库结构并创建配置的管理员；不需要云 Supabase 凭据。镜像、端口和环境变量均直接在 `docker-compose.yml` 的 `image`、`ports` 和 `environment` 中配置。若 GHCR package 尚未公开，先执行 `docker login ghcr.io`；仓库管理员可在 GitHub 的 package 设置中将镜像设为 Public。

| 服务 | 默认访问地址 | 默认宿主机绑定 |
| --- | --- | --- |
| 监控面板 | `http://服务器地址:3000` | `0.0.0.0:3000` |
| 管理后台 | `http://localhost:3001` | `127.0.0.1:3001` |

PostgreSQL、REST、Auth 和 API 网关只监听容器内回环地址，不对外发布。后台默认只允许宿主机本地访问；面板默认对外发布。

## 本地账号与密码

后台登录表单使用 `ADMIN_EMAIL` 与 `ADMIN_PASSWORD`，密码通过本地 Supabase Auth 校验，会话继续使用上游的 cookie 机制。公开注册与 GitHub OAuth 均关闭。

每次容器启动都会确保配置的管理员存在，并同步其密码。更改 Compose 中的账号或密码后执行 `docker compose up -d --force-recreate`。修改账号会创建或接管新邮箱对应的本地账号；旧账号不会被删除，但不再因旧配置自动获得管理员权限，若曾加入允许名单需另行禁用。

登录入口不限制请求的 `Origin`，不再将访问地址与 `APP_URL` 比较；密码和管理员权限仍需验证。登录成功、失败及退出登录均使用站内相对路径跳转，沿用浏览器当前的域名、协议和端口。这也意味着登录表单不再执行跨站来源校验。

Nginx 与容器位于同一宿主机时，将后台代理到实际映射的宿主机端口；例如 `127.0.0.1:45476:3001` 应代理到 `http://127.0.0.1:45476`。使用默认端口映射时，可配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

普通成员的角色和分组允许名单仍由上游后台管理；仅增加允许名单不会自动创建 Auth 密码账号。本镜像自动配置的是 Compose 指定的管理员，不额外提供公开注册或邮件找回密码。需要重置管理员密码时修改 Compose 并重建容器即可。

不要提交包含真实密码的 Compose、`.env`、`data` 或备份。密码若包含 `$`，在 Compose 文件中写成 `$$`，避免被当作环境变量插值；引号及其他特殊字符按 YAML 规则转义。

## 持久化与升级

Compose 只有一个服务，使用一个宿主机目录挂载：

| 主机路径 | 容器路径 | 内容 |
| --- | --- | --- |
| `./data` | `/data` | PostgreSQL 数据、Auth 用户/会话、迁移记录和生成的密钥 |
| `./data/postgres` | `/data/postgres` | PostgreSQL 17 数据目录 |
| `./data/secrets.json` | `/data/secrets.json` | 内部数据库密码与 JWT 签名密钥 |

保留整个 `data` 目录即可重建容器。不要只保留数据库而删除 `secrets.json`；发现已有数据库但缺少密钥时，启动会报错，而不会重置密钥。启动脚本以 root 设置挂载目录权限，各业务进程以非 root 用户运行；不要覆盖 Compose 的运行用户。

升级前先备份，再执行：

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100
```

新库执行上游完整 `supabase/schema.sql`，将该版本已有的 public 迁移记录为基线，不重复执行历史迁移。升级时只执行新增 public 迁移，忽略 `*_dev.sql`，每个迁移与记录在同一事务提交。应用服务只在迁移成功、REST 和 Auth 就绪后启动。

已执行迁移被修改或删除、回退到缺少历史迁移的旧镜像、插入早于已有记录的新迁移时，镜像会停止启动。新迁移若包含显式事务控制，也会停止并要求人工审查，避免破坏迁移与记录的原子性。失败后先查看日志、修复问题或恢复升级前备份，不要删库强行重试。

此方案管理新建数据库及本镜像后续升级；不会自动接管已有 Supabase 数据目录。PostgreSQL 大版本固定为 17，大版本升级需另行执行逻辑备份与恢复。不要在同一个数据目录上同时启动多个容器。

## 备份与恢复

最直接的完整备份是停机后归档整个目录，数据库与密钥始终保持配套：

```bash
mkdir -p backups
docker compose stop
sudo tar -czf "backups/check-cx-$(date +%Y%m%d-%H%M%S).tar.gz" data
docker compose start
```

恢复时先停止容器，将当前 `data` 目录移到另一个位置保留，再从备份归档解出 `data`，保持文件所有者及权限，使用备份对应的镜像版本启动。不要直接复制运行中的 PostgreSQL 数据目录作为备份。

需要在线逻辑备份时，可把备份写入挂载目录，然后复制到备份位置：

```bash
docker compose exec -T check-cx sh -c 'gosu postgres pg_dump -Fc > /data/database.dump'
```

逻辑备份还须单独保留 `data/secrets.json`，恢复时应一并保留应用迁移记录与 Auth schema。优先采用完整停机备份，以简化整体恢复。

## 配置项

完整示例见 `docker-compose.yml`，直接修改对应配置值即可。本镜像面向单容器部署，启动时在内部固定 `CHECK_NODE_ID=local`，无需在 Compose 中配置；保留上游的轮询选主和租约续期逻辑。主要参数：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `image` | `ghcr.io/blissky/check-cx:latest` | 镜像地址与标签 |
| `ADMIN_EMAIL` | `admin@example.com` | 在 Compose 的 environment 中配置 |
| `ADMIN_PASSWORD` | 空，必须填写 | 至少 12 个字符，在 Compose 中配置 |
| `ports` | `0.0.0.0:3000:3000` / `127.0.0.1:3001:3001` | 面板 / 后台，格式为宿主机地址:宿主机端口:容器端口 |
| `CHECK_POLL_INTERVAL_SECONDS` | `60` | 检测周期，秒 |
| `CHECK_CONCURRENCY` | `5` | 检测并发数 |
| `OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS` | `300` | 官方 Status 站点 JSON 接口的轮询间隔，单位秒，范围 60–3600；不调用模型推理 API、不使用模型 API Key |
| `HISTORY_RETENTION_DAYS` | `30` | 历史保留天数，最终边界由上游应用控制 |

首次配置后还需在管理后台添加模型和 Provider，空数据库不会自动添加演示 API 密钥。健康检查覆盖数据库、REST、Auth、面板 API 和后台登录页；任一关键进程退出时整个容器会退出，由 `restart: unless-stopped` 重新启动。

## 自动构建与镜像标签

`.github/workflows/container-ghcr.yml` 在推送 `main`、推送 Git tag、手动运行及每 6 小时时检查上游。PR 执行构建和验证，不发布镜像。

两个上游均从 `vMAJOR.MINOR.PATCH` 正式标签中按版本号取最高版本，排除预发布标签，并解析到具体 Git 提交。这里跟踪 Git tag，不依赖可能落后的 GitHub `releases/latest`。构建时使用冻结的 pnpm lockfile。

镜像标签包括：

- `latest`：最近成功构建并验证的组合。
- 面板版本：例如 `v1.23.19` 和 `1.23.19`；管理后台或本仓库打包代码更新时，这两个别名也会更新。
- `build-<20位哈希>`：由面板、后台和本仓库三个提交生成的组合标签，用于去重及锁定部署；上游版本和提交也记录在镜像 labels 中。

已有组合标签时跳过构建。手动 workflow 的 `force` 可强制重建同一组合，用于刷新基础镜像等场景，因此要求严格不可变部署时应使用镜像 digest。每次正常打包提交都会生成新组合标签，避免 Dockerfile 修复被已有上游版本标签挡住。

流程先构建并加载本地镜像，执行容器就绪检查，通过后再推送 GHCR，最后写入组合标签。就绪检查覆盖数据库、REST、Auth、面板 API 与后台登录页。构建时还对管理后台执行 lint 和生产构建；若上游身份判断代码变化导致密码补丁不再匹配，会停止构建并要求审查补丁。

发布使用仓库的 `GITHUB_TOKEN` 和 `packages: write` 权限；只在 `blissky` 命名空间且非 PR 事件发布。首次发布后确认 GHCR package 与本仓库关联，并按需设置公开可见性。

## 本地构建和验证

需要 Node.js 22+、Git、Docker Buildx 和 Bash。Windows 可使用 Docker Desktop 的 Linux 容器模式；生产部署推荐 Linux。

```bash
# 查看目前将选用的上游版本和提交
node scripts/resolve-upstream.mjs

# 示例版本；生产构建由 workflow 按查询结果检出具体提交
git clone --depth 1 --branch v1.23.19 https://github.com/BingZi-233/check-cx.git .upstream/panel
git clone --depth 1 --branch v0.3.3 https://github.com/BingZi-233/check-cx-admin.git .upstream/admin
docker buildx build --platform linux/amd64 \
  --build-context panel=./.upstream/panel \
  --build-context admin=./.upstream/admin \
  --load -t check-cx:test .
docker run -d --name check-cx-local -p 3000:3000 -p 127.0.0.1:3001:3001 \
  -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD='替换为至少12个字符的强密码' \
  --mount type=bind,src="$PWD/data",dst=/data check-cx:test
docker inspect --format '{{.State.Health.Status}}' check-cx-local
```

执行本地运行命令前先创建 `data` 目录。开发期间的测试脚本统一放在 `tests/`，测试产物放在 `.test-data/`，两者均由 `.gitignore` 屏蔽，不随仓库提交；发布流程不依赖这些本地文件。仓库原有 `docs` 目录仅是本地参考资料，不进入镜像或构建依赖。

## 上游与许可证

- 监控面板：`https://github.com/BingZi-233/check-cx`
- 管理后台：`https://github.com/BingZi-233/check-cx-admin`

本仓库新增的打包代码采用根目录 `LICENSE` 中的 MIT 许可证。第三方组件分别适用各自的许可证；镜像保留面板上游许可证于 `/usr/share/licenses/check-cx/LICENSE`。各应用完整功能与使用方式请参阅对应上游仓库。
