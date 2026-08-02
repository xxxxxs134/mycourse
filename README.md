# mycourse

在线课程购买平台（Nuxt 4 + MySQL + Redis）。

用户浏览课程 → 下单 → 支付（微信 / Mock）→ 解锁内容。后台可轻量添加课程、管理库存。

## 技术栈

- **Nuxt 4**（nitro 服务端 + Vue 3 前端）
- **drizzle-orm** + **mysql2**（数据库，含 drizzle-kit 迁移）
- **ioredis**（订单超时释放 / 状态缓存）
- **微信支付 APIv3**（Native 扫码支付），未配置密钥时自动降级为 Mock 支付

## 快速开始

```bash
npm install
cp .env.example .env      # 填入数据库 / Redis / 微信支付配置
npm run dev               # http://localhost:3000
```

### 数据库迁移

```bash
npx drizzle-kit push      # 按 schema.ts 同步表结构
# 或使用已有迁移:
npx drizzle-kit migrate
```

## 生产部署

```bash
npm run build
node .output/server/index.mjs   # 默认 http://localhost:3000
```

## 环境变量

所有配置通过 `.env` 提供（参见 [.env.example](./.env.example)）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 是 | MySQL 连接 |
| `REDIS_URL` | 否 | Redis 连接串，默认 `redis://127.0.0.1:6379` |
| `WECHAT_APP_ID` 等 6 项 | 否 | 微信支付 APIv3 配置；缺失时自动走 Mock 支付 |

> 未接入真实支付前（或未配置微信密钥），所有支付流程会走 Mock，便于本地联调。页面含「模拟支付」入口。

## 页面

- `/` 课程列表
- `/courses/[id]` 课程详情 + 支付面板（二维码 + 轮询）
- `/success` 支付成功页
- `/inventory` 库存 / 订单概览
- `/add` 添加课程
- `/mock-pay` 模拟支付

## 服务端目录

```
server/
  api/                 # 课程 CRUD、下单、webhook、订单状态轮询
  db/                  # drizzle + mysql2 + ioredis 连接
  plugins/scheduler.ts # 订单超时释放定时任务
  utils/
    release.ts         # 超时未支付订单释放库存
    payments/          # 支付提供方：wechat / stripe / mock
```

> Stripe 目前为占位实现（TODO），支付会回退到 Mock。
