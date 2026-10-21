#!/usr/bin/env node

import { spawn } from 'node:child_process'

const [binPath, projectRoot] = process.argv.slice(2)
if (!binPath || !projectRoot) {
  process.stderr.write('usage: verify-mcp-stdio.mjs <cli-bin.js> <project-root>\n')
  process.exit(2)
}

const child = spawn(process.execPath, [binPath, 'mcp', '--root', projectRoot], {
  cwd: projectRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString('utf8')
})

function send(request) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      child.stdout.off('data', onData)
      reject(new Error(`MCP response timed out for id=${request.id}\n${stderr}`))
    }, 30_000)

    const onData = (chunk) => {
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim()) {
          try {
            const response = JSON.parse(line)
            if (response.id === request.id) {
              clearTimeout(timer)
              child.stdout.off('data', onData)
              resolve(response)
              return
            }
          } catch {
            // Ignore non-JSON diagnostics on stdout and keep reading.
          }
        }
        newline = buffer.indexOf('\n')
      }
    }

    child.stdout.on('data', onData)
    child.stdin.write(`${JSON.stringify(request)}\n`)
  })
}

try {
  const initialized = await send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'release-pack-smoke', version: '1.0.0' },
    },
  })
  if (initialized.error) throw new Error(JSON.stringify(initialized.error))

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)

  const listed = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  if (listed.error) throw new Error(JSON.stringify(listed.error))

  const names = new Set(listed.result?.tools?.map((tool) => tool.name) ?? [])
  for (const required of ['prepare_task', 'validate_diff']) {
    if (!names.has(required)) throw new Error(`packed MCP server is missing ${required}`)
  }

  process.stdout.write(`packed MCP stdio smoke: ${names.size} tools available\n`)
} finally {
  child.kill()
}
