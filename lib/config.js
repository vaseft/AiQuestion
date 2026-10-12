// ============================================================================
// AiQuestion —— 配置读写与规范化
// ----------------------------------------------------------------------------
// 配置持久化到 $DSH_HOME/dsh-aiquestion/config.json。
// 一切字段都做保守规范化：任何非法值回落到默认值，绝不抛错中断对话。
// ============================================================================
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const CONFIG_DIR = path.join(DSH_HOME, 'dsh-aiquestion')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// 提问/裁决话术库（体现“AI 的性格”）：id -> 包内文件名
export const TALKING_LIBS = {
  engineer: 'engineer.txt',
  sassy: 'sassy.txt',
  mentor: 'mentor.txt',
}
export const TALKING_NAMES = {
  engineer: '冷静工程师',
  sassy: '毒舌评审',
  mentor: '耐心导师',
}

// mode：
//   auto   —— 仅当意图含糊 / 预估工作量达到阈值时才澄清（默认，最省 token）
//   always —— 每轮真实用户输入都先澄清一次
//   never  —— 只记录不干预（等价于停用，但保留面板）
export const MODES = ['auto', 'always', 'never']

export const DEFAULT_CONFIG = {
  enabled: true,
  mode: 'auto',
  // 预估工作量达到（含）该值才触发澄清；1-10。调低更啰嗦但更保险，调高更省 token。
  workloadThreshold: 6,
  // 同一意图最多追问轮数，超过则由 AI 以自身判断决断并开工。
  maxRounds: 2,
  talking: 'engineer',
  // 是否发布 aq_intent 工具（默认 false = 零固定提示词开销，最省 token）。
  publishIntentTool: false,
  // 迷你请求（评估/裁决）使用的 OpenAI 兼容端点；留空则复用默认。
  provider: {
    baseURL: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
  },
  // 迷你请求的输出上限（token）。裁决需要输出契约，给稍大一点。
  triageMaxTokens: 512,
  judgeMaxTokens: 768,
  timeoutMs: 20000,
}

function clampInt(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) return fallback
  return n
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

export function normalizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const p = r.provider && typeof r.provider === 'object' ? r.provider : {}
  return {
    enabled: !(r.enabled === false),
    mode: MODES.includes(r.mode) ? r.mode : DEFAULT_CONFIG.mode,
    workloadThreshold: clampInt(r.workloadThreshold, 1, 10, DEFAULT_CONFIG.workloadThreshold),
    maxRounds: clampInt(r.maxRounds, 0, 5, DEFAULT_CONFIG.maxRounds),
    talking: TALKING_LIBS[r.talking] ? r.talking : DEFAULT_CONFIG.talking,
    publishIntentTool: r.publishIntentTool === true,
    provider: {
      baseURL: str(p.baseURL, DEFAULT_CONFIG.provider.baseURL) || DEFAULT_CONFIG.provider.baseURL,
      apiKeyEnv: str(p.apiKeyEnv, DEFAULT_CONFIG.provider.apiKeyEnv) || DEFAULT_CONFIG.provider.apiKeyEnv,
      model: str(p.model, DEFAULT_CONFIG.provider.model) || DEFAULT_CONFIG.provider.model,
    },
    triageMaxTokens: clampInt(r.triageMaxTokens, 64, 4096, DEFAULT_CONFIG.triageMaxTokens),
    judgeMaxTokens: clampInt(r.judgeMaxTokens, 64, 4096, DEFAULT_CONFIG.judgeMaxTokens),
    timeoutMs: clampInt(r.timeoutMs, 2000, 120000, DEFAULT_CONFIG.timeoutMs),
  }
}

export function readConfig() {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')))
  } catch {
    return normalizeConfig(DEFAULT_CONFIG)
  }
}

export function writeConfig(cfg) {
  const body = JSON.stringify(
    { ...normalizeConfig(cfg), updatedAt: new Date().toISOString() },
    null,
    2,
  )
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, body, 'utf8')
    return true
  } catch {
    return false
  }
}
