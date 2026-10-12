// AiQuestion —— 测试入口：委托给 Node 内置 test runner（node --test）。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => path.join(dir, f))

if (files.length === 0) {
  console.error('未找到测试文件')
  process.exit(1)
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(res.status ?? 1)
