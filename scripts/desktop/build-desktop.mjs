import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnChildProcess } from './spawn-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const npmCommand = 'npm'
const npxCommand = 'npx'

const DMG_RELEASE = 'dmg-builder@1.2.0'
const DMG_BUNDLE_VERSION = '75c8a6c'
const DMG_ARCH = process.arch === 'arm64' ? 'arm64' : 'x86_64'
const DMG_ARCHIVE = `dmgbuild-bundle-${DMG_ARCH}-${DMG_BUNDLE_VERSION}.tar.gz`
const DMG_DOWNLOAD_URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${DMG_RELEASE}/${DMG_ARCHIVE}`
const DMG_CACHE_ROOT = path.join(projectRoot, '.cache', 'dmg-builder', DMG_ARCH)
const DMG_ARCHIVE_PATH = path.join(DMG_CACHE_ROOT, DMG_ARCHIVE)
const DMG_VENDOR_PATH = path.join(DMG_CACHE_ROOT, 'dmgbuild')

const run = (command, args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawnChildProcess(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv,
      },
    })

    child.once('exit', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}`))
    })
    child.once('error', reject)
  })

const ensureDmgVendor = async () => {
  if (existsSync(DMG_VENDOR_PATH)) {
    return DMG_VENDOR_PATH
  }

  await rm(DMG_CACHE_ROOT, { recursive: true, force: true })
  await mkdir(DMG_CACHE_ROOT, { recursive: true })

  await run('curl', ['-L', DMG_DOWNLOAD_URL, '-o', DMG_ARCHIVE_PATH])
  await run('tar', ['-xzf', DMG_ARCHIVE_PATH, '-C', DMG_CACHE_ROOT])

  if (!existsSync(DMG_VENDOR_PATH)) {
    throw new Error(`DMG vendor was extracted but ${DMG_VENDOR_PATH} is missing`)
  }

  return DMG_VENDOR_PATH
}

const main = async () => {
  await run(npmCommand, ['run', 'build:web'])
  await run(npmCommand, ['run', 'build:electron'])
  const dmgVendorPath = await ensureDmgVendor()
  await run(npxCommand, ['electron-builder', '--mac', 'dmg', 'zip', '--publish', 'never'], {
    CUSTOM_DMGBUILD_PATH: dmgVendorPath,
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
