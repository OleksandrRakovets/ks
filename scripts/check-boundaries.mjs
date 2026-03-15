import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', '.opencode', 'dist', 'build'])

function listSourceFiles(dirPath) {
  const out = []
  const entries = readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (SKIP_DIRS.has(entry.name)) continue

    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(fullPath))
      continue
    }

    const dot = entry.name.lastIndexOf('.')
    const ext = dot >= 0 ? entry.name.slice(dot) : ''
    if (SOURCE_EXTENSIONS.has(ext)) {
      out.push(fullPath)
    }
  }
  return out
}

function collectImports(content) {
  const imports = []
  const fromRegex = /from\s+['"]([^'"]+)['"]/g
  const dynamicRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g

  let match = fromRegex.exec(content)
  while (match) {
    imports.push(match[1])
    match = fromRegex.exec(content)
  }

  match = dynamicRegex.exec(content)
  while (match) {
    imports.push(match[1])
    match = dynamicRegex.exec(content)
  }

  return imports
}

const failures = []

for (const file of listSourceFiles(join(ROOT, 'packages/core'))) {
  const imports = collectImports(readFileSync(file, 'utf8'))
  for (const specifier of imports) {
    if (specifier.startsWith('@ks/competition') || specifier.startsWith('@ks/gameplay')) {
      failures.push(`${relative(ROOT, file)} imports ${specifier} (core must not depend on competition/gameplay)`)
    }
  }
}

for (const file of listSourceFiles(join(ROOT, 'packages/gameplay'))) {
  const imports = collectImports(readFileSync(file, 'utf8'))
  for (const specifier of imports) {
    if (specifier.startsWith('@ks/competition')) {
      failures.push(`${relative(ROOT, file)} imports ${specifier} (gameplay must not depend on competition)`)
    }
  }
}

for (const file of listSourceFiles(join(ROOT, 'packages/competition'))) {
  const imports = collectImports(readFileSync(file, 'utf8'))
  for (const specifier of imports) {
    if (specifier.startsWith('@ks/client')) {
      failures.push(`${relative(ROOT, file)} imports ${specifier} (competition must stay runtime-agnostic)`)
    }
  }
}

if (failures.length) {
  console.error('Boundary check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Boundary checks passed')
