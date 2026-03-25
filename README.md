# cf-ai-worker

基于 Cloudflare Workers 的 OpenAI 兼容 API 网关，用来把固定的 OpenAI 风格请求转发到 Cloudflare Workers AI。

## 当前支持内容

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `POST /api/ai`
  - 兼容旧入口，内部复用 `/v1/chat/completions`
- 可选的 Bearer Token 鉴权
  - 通过 `OPENAI_API_KEY` 控制
- CORS
  - 允许 `Content-Type`、`Authorization`、`X-Debug-AI-Response`
- 调试响应
  - 请求头 `X-Debug-AI-Response: 1` 会在 JSON 响应里附带底层模型和原始 AI 返回值

## 当前支持模型

只有下面这些模型 ID 会被接受，未知模型会直接返回 `400 invalid_request_error`。

| 请求模型 ID | Cloudflare Workers AI 模型 |
| --- | --- |
| `kimi-k2.5` | `@cf/moonshotai/kimi-k2.5` |
| `glm-4.7-flash` | `@cf/zai-org/glm-4.7-flash` |
| `deepseek-r1` | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |
| `deepseek-r1-qwen32b` | `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` |

`GET /v1/models` 当前返回的公开模型列表是：

- `kimi-k2.5`
- `glm-4.7-flash`
- `deepseek-r1-qwen32b`

## 当前行为说明

- `model` 是必填字段
- `top_p` 目前未实现
  - 传入后会直接返回 `400 invalid_request_error`
- `/v1/responses` 对 `kimi-k2.5` 和 `glm-4.7-flash` 会优先转成 `messages` 调用
- 其他已支持模型仍会把输入整理成单个 `prompt`
- `stream: true` 已支持 SSE 输出

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 本地开发

```bash
npm run dev
```

### 3. 运行测试

```bash
npm test
```

### 4. 部署

```bash
npm run deploy
```

### 5. 配置访问密钥

如果你希望网关必须校验 Bearer Token：

```bash
npx wrangler secret put OPENAI_API_KEY
```

如果不配置 `OPENAI_API_KEY`，接口将不做鉴权。

## 示例

### Chat Completions

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [
      { "role": "user", "content": "你好" }
    ]
  }'
```

### Responses

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "kimi-k2.5",
    "input": [
      {
        "role": "user",
        "content": [
          { "type": "input_text", "text": "你好" }
        ]
      }
    ]
  }'
```

### 调试原始 AI 返回

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -H "X-Debug-AI-Response: 1" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [
      { "role": "user", "content": "Reply with exactly: GLM_OK" }
    ]
  }'
```

## 配置

项目当前使用的 Wrangler 配置见 [wrangler.jsonc](/Users/zhangyiwu/CF/cf-ai-worker/wrangler.jsonc)。

核心字段如下：

```json
{
  "name": "cf-ai-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-28",
  "observability": {
    "enabled": true
  },
  "ai": {
    "binding": "AI"
  },
  "vars": {
    "OPENAI_API_KEY": ""
  }
}
```

## 项目结构

```text
cf-ai-worker/
├── src/
│   └── index.ts
├── tests/
│   └── model-routing.test.mjs
├── package.json
├── wrangler.jsonc
└── README.md
```

## 技术栈

- Cloudflare Workers
- Cloudflare Workers AI
- TypeScript
- Wrangler
- Node.js 内置测试运行器

## 注意事项

1. 当前不是通用 OpenAI 网关，只接受 README 列出的少量模型 ID。
2. 文档里没有列出的参数，不代表已经实现。
3. 首次部署前需要先在 Cloudflare 侧启用 Workers AI。

## License

MIT
