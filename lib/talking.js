// ============================================================================
// AiQuestion —— 话术库（AI 的“性格”）
// ----------------------------------------------------------------------------
// 文件放在 talking/ 下，一行一条。首次启动会把包内文件种到 $DSH_HOME/talking/，
// 之后优先读取该目录（用户可直接编辑自定义，无需碰 node_modules）。
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_HOME, TALKING_LIBS } from './config.js'

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TALKING_DIRS = [path.join(DSH_HOME, 'talking'), path.join(PACKAGE_ROOT, 'talking')]

const FALLBACK = '这条需求还不够清楚，先说人话：你到底要什么？'

function libPath(name) {
  const file = TALKING_LIBS[name] || TALKING_LIBS.engineer
  for (const dir of TALKING_DIRS) {
    const p = path.join(dir, file)
    try {
      if (fs.statSync(p).isFile()) return p
    } catch {
      /* 继续找 */
    }
  }
  return null
}

export function loadLines(name) {
  const p = libPath(name)
  if (!p) return []
  try {
    return fs
      .readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'))
  } catch {
    return []
  }
}

export function pickLine(name) {
  const lines = loadLines(name)
  if (lines.length === 0) return FALLBACK
  return lines[Math.floor(Math.random() * lines.length)]
}

/** 首次启动：把包内 talking/*.txt 种到 $DSH_HOME/talking/（已存在则不覆盖）。 */
export function seedTalking() {
  const dst = path.join(DSH_HOME, 'talking')
  try {
    fs.mkdirSync(dst, { recursive: true })
  } catch {
    return
  }
  for (const file of Object.values(TALKING_LIBS)) {
    const target = path.join(dst, file)
    try {
      if (fs.existsSync(target)) continue
    } catch {
      /* ignore */
    }
    try {
      fs.copyFileSync(path.join(PACKAGE_ROOT, 'talking', file), target)
    } catch {
      /* 包内缺失则跳过 */
    }
  }
}
