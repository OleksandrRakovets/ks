import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', '.opencode', 'dist', 'build'])

const rootPackageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const workspaceConfig = rootPackageJson.workspaces
const workspacePatterns = Array.isArray(workspaceConfig)
  ? workspaceConfig
  : Array.isArray(workspaceConfig?.packages)
    ? workspaceConfig.packages
    : []
const pinnedZodVersion = workspaceConfig?.catalog?.zod

if (typeof pinnedZodVersion !== 'string' || !pinnedZodVersion) {
  console.error('Missing root workspace catalog entry for zod')
  process.exit(1)
}

const workspacePaths = []

for (const pattern of workspacePatterns) {
  if (!pattern.endsWith('/*')) continue
  const parent = pattern.slice(0, -2)
  const parentPath = join(ROOT, parent)
  let entries = []
  try {
    entries = readdirSync(parentPath, { withFileTypes: true })
  } catch {
    continue
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const workspacePath = join(parentPath, entry.name)
    try {
      statSync(join(workspacePath, 'package.json'))
      workspacePaths.push(workspacePath)
    } catch {
      // skip folders without package.json
    }
  }
}

function listSourceFiles(dirPath) {
  const files = []
  const entries = readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (SKIP_DIRS.has(entry.name)) continue

    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }

    const dot = entry.name.lastIndexOf('.')
    const ext = dot >= 0 ? entry.name.slice(dot) : ''
    if (SOURCE_EXTENSIONS.has(ext)) {
      files.push(fullPath)
    }
  }
  return files
}

const invalidImportMatches = []
const missingDependencyPackages = []
const mismatchedVersionPackages = []

for (const workspacePath of workspacePaths) {
  const packageJsonPath = join(workspacePath, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const packageName = packageJson.name || relative(ROOT, workspacePath)

  const zodVersion =
    packageJson?.dependencies?.zod ?? packageJson?.devDependencies?.zod ?? packageJson?.peerDependencies?.zod ?? null

  if (zodVersion && zodVersion !== 'catalog:') {
    mismatchedVersionPackages.push({ packageName, zodVersion })
  }

  const files = listSourceFiles(workspacePath)
  let usesZod = false

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')

    const hasInvalidImport =
      /from\s+['"]zod\/v4['"]/.test(content) ||
      /import\s*\(\s*['"]zod\/v4['"]\s*\)/.test(content) ||
      /require\(\s*['"]zod\/v4['"]\s*\)/.test(content)

    if (hasInvalidImport) {
      invalidImportMatches.push(relative(ROOT, filePath))
    }

    if (
      /from\s+['"]zod['"]/.test(content) ||
      /import\s*\(\s*['"]zod['"]\s*\)/.test(content) ||
      /require\(\s*['"]zod['"]\s*\)/.test(content)
    ) {
      usesZod = true
    }
  }

  if (usesZod && !zodVersion) {
    missingDependencyPackages.push(packageName)
  }
}

if (invalidImportMatches.length || missingDependencyPackages.length || mismatchedVersionPackages.length) {
  if (invalidImportMatches.length) {
    console.error('Invalid zod import path found (use zod):')
    for (const match of invalidImportMatches) {
      console.error(`- ${match}`)
    }
  }

  if (missingDependencyPackages.length) {
    console.error('Packages using zod without direct zod dependency:')
    for (const packageName of missingDependencyPackages) {
      console.error(`- ${packageName}`)
    }
  }

  if (mismatchedVersionPackages.length) {
    console.error(`Packages with zod version not using root catalog (${pinnedZodVersion}):`)
    for (const item of mismatchedVersionPackages) {
      console.error(`- ${item.packageName}: ${item.zodVersion}`)
    }
  }

  process.exit(1)
}

console.log(`zod checks passed with catalog version ${pinnedZodVersion}`)
