import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies by method
  result?: any
  error?: { code: number; message: string }
}

export async function sendRequest(
  child: ChildProcessWithoutNullStreams,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const requestLine = `${JSON.stringify(request)}\n`

  return new Promise<JsonRpcResponse>((resolveFn, rejectFn) => {
    let buffer = ''

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf-8')

      let nl: number
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic line-reader loop
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.trim().length === 0) continue

        try {
          const parsed = JSON.parse(line) as JsonRpcResponse
          if (parsed.id === request.id) {
            child.stdout.off('data', onData)
            clearTimeout(timer)
            resolveFn(parsed)
            return
          }
        } catch {
          // Non-JSON line — skip.
        }
      }
    }

    const timer = setTimeout(() => {
      child.stdout.off('data', onData)
      rejectFn(new Error(`timed out waiting for response to id ${request.id}`))
    }, 30_000)

    child.stdout.on('data', onData)

    child.stdin.write(requestLine, (err) => {
      if (err) {
        clearTimeout(timer)
        rejectFn(err)
      }
    })
  })
}
