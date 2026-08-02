# Workers AI 模型更新设计

## 目标

更新网关默认模型组合，移除对已弃用 Kimi K2.5 推理端点的依赖，同时保持现有客户端兼容，并新增一个高性价比通用推理模型。

## 模型配置

- 新增公开模型 `kimi-k2.6`，转发到 `@cf/moonshotai/kimi-k2.6`，使用原生 `messages`。
- 保留请求 ID `kimi-k2.5` 作为隐藏兼容别名，但将其转发到 `@cf/moonshotai/kimi-k2.6`；它不出现在 `/v1/models` 中。
- 新增公开模型 `gpt-oss-120b`，转发到 `@cf/openai/gpt-oss-120b`，使用原生 `messages`，`owned_by` 为 `openai`。
- 保留 `glm-4.7-flash`、`deepseek-r1` 和 `deepseek-r1-qwen32b` 的现有行为。

因此 `/v1/models` 按配置顺序公开：

1. `kimi-k2.6`
2. `glm-4.7-flash`
3. `deepseek-r1-qwen32b`
4. `gpt-oss-120b`

## 兼容性

旧客户端继续请求 `kimi-k2.5` 时不会收到未知模型错误，但实际响应由 Kimi K2.6 生成。普通 OpenAI 兼容响应继续在 `model` 字段回显客户端请求的 `kimi-k2.5`；只有调试响应中的底层模型 ID 显示真实的 `@cf/moonshotai/kimi-k2.6`。

不为 `gpt-oss-120b` 增加额外请求参数；它复用现有 OpenAI 兼容聊天和 Responses 转换路径。函数调用等尚未由网关暴露的能力不在本次范围内。

## 测试策略

按照测试驱动方式先更新断言并观察其在旧配置下失败，然后修改配置：

- 验证 `kimi-k2.6` 和 `gpt-oss-120b` 的请求 ID 映射。
- 验证旧 `kimi-k2.5` 隐藏别名映射到 K2.6。
- 验证 Kimi K2.6 与 GPT-OSS 120B 使用原生 `messages`。
- 验证 `/v1/models` 的公开列表不包含旧 Kimi ID。
- 分别验证 `/v1/chat/completions` 和 `/v1/responses` 对 `kimi-k2.6`、隐藏的 `kimi-k2.5` 以及 `gpt-oss-120b` 使用正确的底层模型 ID，并传递 `messages` 而不是 `prompt`。
- 运行完整 `npm test` 回归测试。

仓库测试使用模拟的 Workers AI binding，只能验证注册表、请求转换和响应转换逻辑，不能证明真实的 Workers AI 模型接受请求或返回预期结构。本次不部署生产 Worker，因此不会把线上兼容性列为已验证；部署前应使用真实 binding 对两个新模型分别执行非流式聊天、Responses 和 SSE 流式冒烟测试。

## 文档

同步更新 README 的支持模型表、公开模型列表、行为说明、请求示例和模型更新说明，避免再次暗示更新默认模型时无需同步测试与文档。

## 交付

实现后立即运行完整测试和差异检查，只暂存本次设计、配置、测试及 README 文件。创建实现提交并推送当前分支，随后确认远端分支指向该提交且工作区干净。
