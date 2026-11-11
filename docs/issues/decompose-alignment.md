---
issue: "d0dd937df77445f210774f42185c5f7b"
date: 2026-11-11
status: confirmed
owner_decision: ""
decision_mode: auto
autonomy_ref: "A1#s4-gate"
---

# 拆解对齐单 · issue d0dd937df77445f210774f42185c5f7b

## 1. 任务清单

| # | 目标(一句话) | 涉及文件 | 验收判据 | 车道 | 执行者角色/形态 | 复杂度/模型/强度 | depends_on | 并行批次 |
|---|---|---|---|---|---|---|---|---|
| T1 | Conditional Clear filters button + locale key + hidden/shown/reset tests + docs line | `src/client/execution.tsx`, `src/client/locales.ts`, `tests/panel-execution.spec.tsx`, `docs/005-panel.md` | `pnpm vitest run tests/panel-execution.spec.tsx tests/locales.spec.ts` green; `pnpm check` exit 0; control classes/label/position confirmed by the DOM assertions | 快速 | 实现 + 测试, 原生 lane | T1 / 继承 / medium | — | 批 1 |

**粒度自检**(七条达标线): T1 ✅ 单一目标 / ≤3 生产文件 / 单一判据集 / 自包含 / 可独立验证 / 预估可控 / 单一执行者。

## 1b. 判据覆盖矩阵

| 判据 | 判据摘要(可判定观测) | 承接任务 | 承接任务的验收命令 |
|---|---|---|---|
| AC-1 | Open 下 `.dt-filters` 无 Clear filters 控件 | T1 | panel spec hidden case → `all('.dt-filters button')` has no clear label |
| AC-2 | 四个非默认 filter 下, Pills 之后出现 outline 小按钮(zh/en 标签, Button + Icon) | T1 | panel spec shown cases → `.dt-btn-outline.dt-btn-sm` after last pill, text 清除筛选 |
| AC-3 | 点击后回到 Open: 无 filter query, Open pill active, 请求 `tickets?state=open&limit=20`, 按钮消失 | T1 | panel spec reset case → request list + `aria-pressed` + control absent |
| AC-4 | panel spec 覆盖三种情况; locale spec 双语通过 | T1 | `pnpm vitest run tests/panel-execution.spec.tsx tests/locales.spec.ts` |
| AC-5 | `pnpm check` 通过 | T1 | `pnpm check` → exit 0 |
| AC-6 | PR 描述含同视口同主题带标注的 Before/After 截图, 命名基线与被改版本 | T1 | PR body + attachments; baseline `310ae2e`, after = ticket branch head |

**缺口登记**: 无。

## 1c. 架构行

| 任务 | affected_modules | arch_doc_required | 架构文档动作 |
|---|---|---|---|
| T1 | `src/client` | none | 无;仅一个视图的条件控件与文案 |

**模块汇总**: `src/client`。
**arch-doc 任务**: 无。

## 2. 怎么做(实现方案)

### T1 · Conditional Clear filters button

- **方案**: 在 `ExecutionStatus` 的 `.dt-filters` 中, pills 映射之后追加
  `{current !== 'open' && <Button variant="outline" size="sm" icon={<Icon name="filter" size={14} />} onClick={clear}>{t('clearFilters')}</Button>}`;
  `clear` 与 Open pill 相同: `setLimit(20); navigate({ page: 'execution' }, true)`。在 `zh` 与 `en` 各加
  `clearFilters: ['清除筛选', 'Clear filters']`。在 `tests/panel-execution.spec.tsx` 增加 hidden、四个非默认
  filter 的 shown(可覆盖 Pending 与 Ended)、reset 断言。在 `docs/005-panel.md` 的 Execution 行补一句。
- **边界**: 不碰 Trigger/Eval 行、`TICKET_FILTERS`、路由、API;不新增 CSS。
- **避坑**: 复用既有 replace:true 导航;按钮由 `current` 条件渲染而非 CSS 隐藏;双语键同时添加。
- **验收判据**: `pnpm check` → exit 0。

## 2b. 测试环境前置

| 任务 | 设备 / 架构 | 物理分辨率 / 方向 | 逻辑分辨率 / 方向 | 截图 / 观测变换 | 来源 |
|---|---|---|---|---|---|
| T1 | 桌面浏览器 (Chromium headless) | 不适用 | 1440×900 横屏 | 无需旋转; DOM 断言以 jsdom 为准 | Playwright 截图用于 PR 证据 |

## 3. 派谁

- 形态: 主会话原生 lane (`feature_exec_dispatch` executor=subagent, backend=spawn)。
- 复杂度 T1;模型继承运行时默认;`reasoning_effort: medium`。
- 确认门: A1 自动签 `auto:A1#s4-form` + `auto:A1#s4-gate` (执行前审批已覆盖), 派发后回填 lane id。

## 4. 并行图

单任务,批 1 即全部;无排队任务。
