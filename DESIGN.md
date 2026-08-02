ws# DESIGN.md — mycourse 设计系统

> 本文件是网站唯一设计事实来源。所有页面/组件必须从此系统取值，不得硬编码新颜色/字号。

## 1. 产品与目标
在线课程购买平台（Nuxt 4）。用户浏览课程 → 下单 → 支付（微信/Stripe/Mock）→ 解锁内容。
目标：让"买课-支付"流程**可信、顺畅、低焦虑**；后台加课操作轻量不花哨。

## 2. 品牌与用户
- 用户：想学编程/技术的个人开发者，首次访问可能犹豫付费。
- 品牌气质：干净、专业、可信（类 Stripe / 主流在线课程平台）。
- 语言：中文界面，文案直接、少废话。

## 3. 视觉方向
- 白底 + 深色文字 + **绿色主色（支付/CTA 关联微信绿）** + 蓝色点缀（链接/信息）。
- 克制的阴影层次，大面积留白，圆角适中（6–14px）。
- 无装饰插画，无渐变炫技；信息密度优先。

## 4. 布局系统
- 内容最大宽度 `1120px`，左右安全边距 `24px`（移动 16px）。
- 页面垂直节奏：章节间距 64px，卡片间 24px，卡片内 20px。
- 断点（mobile-first）：
  - `sm 640` ／ `md 768` ／ `lg 1024` ／ `xl 1280`
- 栅格：课程列表在 `md+` 用 2 列，`lg+` 用 3 列；表单/详情页单列 `max 640px` 居中。

## 5. 基础元素（Primitives & States）
### 5.1 颜色
```
背景      bg           #FFFFFF
表面      surface      #FFFFFF
表面柔和  surface-subtle  #F8FAFC      (slate-50)
墨水      ink          #0F172A      (正文/标题主色, slate-900)
文字次要  text-secondary #475569    (slate-600)
文字弱    text-muted   #94A3B8      (slate-400)
描边      border       #E2E8F0      (slate-200)
描边强    border-strong #CBD5E1

主色      primary      #16A34A      (绿色, CTA/已解锁/成功, green-600)
主色悬停  primary-hover #15803D
主色底    primary-subtle #F0FDF4     (绿色浅底)
点缀      accent       #2563EB      (蓝色, 链接/信息, blue-600)

危险      danger       #DC2626
聚焦环    focus-ring   rgba(22,163,74,.35)
```
语义：`success=primary`、`info=accent`、`warning=#F59E0B`、`error=danger`。

### 5.2 字体与字号
- 栈：`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`（无外链字体，加载快）。
- 字号阶梯（`--fs-*`）：`xs 12 / sm 14 / base 16 / lg 18 / xl 20 / 2xl 24 / 3xl 30`
- 字重：正文 400，强调 500，标题 600，大标题 700。
- 行高：正文 `1.6`，标题 `1.25`。

### 5.3 间距（4px 网格）
`0 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`

### 5.4 圆角与阴影
- 圆角：`sm 6 / md 10 / lg 14 / full 9999`
- 阴影（克制）：
  - `shadow-sm: 0 1px 2px rgba(15,23,42,.06)`
  - `shadow-md: 0 4px 12px rgba(15,23,42,.08)`
  - `shadow-lg: 0 12px 32px rgba(15,23,42,.12)`（仅弹层/二维码卡片）

### 5.5 图标
优先 `inline SVG`（24x24，stroke 1.8，`color: currentColor`）。不引入图标库。

### 5.6 交互状态
- 按钮 hover：加深 `10%`；active：`translateY(1px)`；disabled：`opacity .5; cursor: not-allowed`。
- 链接 hover：下划线 + `text-secondary` 加深。
- 聚焦：所有可交互元素 `outline: 2px solid focus-ring; outline-offset: 2px`。
- 付费状态色：已解锁=绿底绿字徽章；未解锁=描边灰徽章。

## 6. 组件清单（待建，位于 `app/components/ui/`）
- `UiButton.vue`（variants: primary/outline/ghost；sizes: sm/md/lg；states: loading/disabled）
- `UiBadge.vue`（variants: success/neutral/accent/danger）
- `UiCard.vue`（surface + border + shadow-sm + radius-md）
- `UiInput.vue` / `UiTextarea.vue` / `UiSelect.vue`（统一边框/聚焦/错误态）
- `UiSpinner.vue`（loading 用，SVG 旋转）
- `PageHeader.vue`（页面标题 + 副标题）
- `EmptyState.vue`（无数据占位）
- 页面内组件：`CourseCard.vue`、`CourseDetail.vue`、`PayPanel.vue`、`AddCourseForm.vue`

## 7. 页面模板（Template）
- **课程列表页**：顶部 PageHeader → 课程卡片网格（封面区=标题+价格徽章+副标题，右下角"查看详情"）。
- **课程详情页**：左侧内容区（描述/章节列表），右侧 `PayPanel` 吸顶卡片（价格、支付方式、购买按钮、二维码、轮询进度）。
- **成功页**：居中大绿勾 + 标题 + 返回列表按钮。
- **添加课程页**：单列 `max 640px` 表单，标题 + 分字段 + 提交/取消。
- 通用：页面底部统一留白 64px；导航仅 "课程列表 / 添加课程" 两个链接。

## 8. 响应式与无障碍
- 移动端：卡片单列、按钮全宽、`PayPanel` 不再吸顶（顺序流在内容下方）。
- 焦点可见（见 5.6）；按钮/链接有 `:focus-visible` 样式。
- 对比度达标：正文 ink 于白底 ≥ 12:1；次要文字 ≥ 7:1。
- 尊重 `prefers-reduced-motion`（动画只保留 opacity/transform，短时）。
- 减少动画闪烁：loading 态用确定性文案（"正在生成支付..."）+ spinner，不用随机跳动。
