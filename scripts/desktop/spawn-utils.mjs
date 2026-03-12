import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const cmdExe = process.env.ComSpec || 'cmd.exe'

const needsCmdShim = (command) => {
  if (!isWindows) return false

  // Modern Node on Windows rejects spawning .cmd/.bat directly (EINVAL) for security.
  // Running them through cmd.exe is the documented workaround.
  const lower = String(command).toLowerCase()
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) return true

  // Common Node package managers resolve to *.cmd on Windows.
  if (lower === 'npm' || lower === 'npx' || lower === 'pnpm' || lower === 'yarn') return true

  return false
}

const quoteCmdArg = (arg) => {
  const value = String(arg)
  if (value.length === 0) return '""'

  // Keep this conservative; our current usages are simple, but we still want
  // predictable behavior if someone adds a path with spaces later.
  if (!/[ \t"]/u.test(value)) return value

  // cmd.exe accepts doubled quotes inside a quoted string.
  return `"${value.replaceAll('"', '""')}"`
}

const toCmdCommandLine = (command, args) =>
  [command, ...args].map(quoteCmdArg).join(' ')

export const spawnChildProcess = (command, args, options) => {
  if (!needsCmdShim(command)) {
    return spawn(command, args, options)
  }

  const commandLine = toCmdCommandLine(command, args)
  return spawn(cmdExe, ['/d', '/s', '/c', commandLine], {
    ...options,
    windowsVerbatimArguments: true,
  })
}

