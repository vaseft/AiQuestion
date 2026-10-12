// ============================================================================
// AiQuestion —— 极小的“旁路”模型请求
// ----------------------------------------------------------------------------
// 目标：在不消耗主模型任何 token 的前提下完成评估/裁决。
//   1) 优先复用宿主 DSH 暴露的 LLM 服务（若可探测到），避免重复配置；
//   2) 否则回退到 OpenAI 兼容端点（credentials / 环境变量取 key）。
// 任何失败都返回 null，由调用方 fail-open 放行——绝不因为旁路失败卡住对话。
// ============================================================================

function extractText(out) {
  if (!out) return ''
  if (typeof out === 'string') return out
  if (typeof out.text === 'string') return out.text
  if (typeof out.content === 'string') return out.content
  if (Array.isArray(out.content)) {
    return out.content
      .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
      .map((b) => b.text || '')
      .join('\n')
  }
  const choice = out.choices && out.choices[0]
  if (choice) {
    const m = choice.message || choice
    if (m && typeof m.content === 'string') return m.content
    if (m && Array.isArray(m.content)) {
      return m.content.map((b) => (b && b.text) || '').join('\n')
    }
  }
  return ''
}

// —— 1) 尝试宿主 LLM 服务 ——
async function tryHostLlm(ctx, cfg, system, user) {
  let llm
  try {
    llm = ctx.get ? ctx.get('llm') : null
  } catch {
    llm = null
  }
  if (!llm || typeof llm !== 'object') return null
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const attempts = [
    () => llm.complete && llm.complete({ messages, temperature: 0, maxTokens: cfg.triageMaxTokens }),
    () => llm.generate && llm.generate({ messages, temperature: 0, maxTokens: cfg.triageMaxTokens }),
    () => llm.chat && llm.chat({ messages, temperature: 0, maxTokens: cfg.triageMaxTokens }),
    () => llm.invoke && llm.invoke({ messages }),
  ]
  for (const run of attempts) {
    try {
      const out = await run()
      const text = extractText(out)
      if (text && text.trim()) return text
    } catch {
      /* 换下一种形态 */
    }
  }
  return null
}

async function resolveKey(ctx, cfg) {
  // 1) 显式配置
  if (cfg.provider && cfg.provider.apiKey) return cfg.provider.apiKey
  // 2) DSH 凭据服务
  try {
    const cred = await ctx.credentials.resolve(cfg.provider.apiKeyEnv)
    if (cred && cred.value) return cred.value
  } catch {
    /* 继续 */
  }
  // 3) 环境变量
  const env = process.env[cfg.provider.apiKeyEnv]
  if (env) return env
  return null
}

// —— 2) 回退：直连 OpenAI 兼容端点 ——
async function tryHttpLlm(ctx, cfg, system, user, maxTokens) {
  const key = await resolveKey(ctx, cfg)
  if (!key) return null
  const base = String(cfg.provider.baseURL || '').replace(/\/+$/, '')
  if (!base) return null
  const url = base.endsWith('/chat/completions') ? base : base + '/chat/completions'
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: cfg.provider.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    if (!res.ok) return null
    const data = await res.json()
    return extractText(data) || null
  } catch {
    return null
  }
}

/**
 * 调用旁路模型。返回文本或 null（null 表示失败，调用方应 fail-open）。
 * @param {object} ctx 插件上下文
 * @param {object} cfg 规范化后的配置
 * @param {string} system 系统提示词
 * @param {string} user 用户内容
 * @param {number} maxTokens 输出上限
 */
export async function callMini(ctx, cfg, system, user, maxTokens) {
  try {
    const viaHost = await tryHostLlm(ctx, cfg, system, user)
    if (viaHost && viaHost.trim()) return viaHost.trim()
  } catch {
    /* 回退 HTTP */
  }
  try {
    return await tryHttpLlm(ctx, cfg, system, user, maxTokens)
  } catch {
    return null
  }
}

/** 从可能带代码围栏/前后缀的文本里抠出第一个完整 JSON 对象并解析。 */
export function parseJson(text) {
  if (!text || typeof text !== 'string') return null
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}
