import type { Server } from 'node:http'

export interface ListenWithFallbackOptions {
  /** The HTTP server to bind. */
  server: Server
  /** Starting port (default 3099 for the cockpit). */
  preferredPort: number
  /** Maximum fallback port (default 3110 = preferredPort + 11). */
  maxPort?: number
  /** When true, port is explicit — no fallback, EADDRINUSE → throw. Default false. */
  explicit?: boolean
}

export interface ListenWithFallbackResult {
  /** Port the server actually bound to. */
  port: number
  /** True if we had to fall through past preferredPort. */
  usedFallback: boolean
}

/**
 * Bind a node:http Server to preferredPort, falling through preferredPort+1
 * .. maxPort on EADDRINUSE. When explicit=true, skip the fallback and surface
 * the original error with a friendlier message.
 */
export async function listenWithFallback(
  opts: ListenWithFallbackOptions,
): Promise<ListenWithFallbackResult> {
  const start = opts.preferredPort
  const max = opts.maxPort ?? start + 11
  const explicit = opts.explicit ?? false

  if (explicit) {
    // No fallback — bind exactly the preferred port or fail.
    try {
      await listenOnce(opts.server, start)
      return { port: start, usedFallback: false }
    } catch (err) {
      if (isAddressInUse(err)) {
        throw new Error(
          `Port ${start} is already in use. Choose a different --port or stop the conflicting process.`,
        )
      }
      throw err
    }
  }

  let lastErr: unknown = null
  for (let port = start; port <= max; port++) {
    try {
      await listenOnce(opts.server, port)
      return { port, usedFallback: port !== start }
    } catch (err) {
      lastErr = err
      if (!isAddressInUse(err)) throw err
      // EADDRINUSE — try next port
    }
  }
  throw new Error(
    `All ports in [${start}..${max}] are in use. Free one or pass --port with a different value.`,
    { cause: lastErr instanceof Error ? lastErr : undefined },
  )
}

function listenOnce(server: Server, port: number): Promise<void> {
  return new Promise((resolveFn, rejectFn) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening)
      rejectFn(err)
    }
    const onListening = (): void => {
      server.removeListener('error', onError)
      resolveFn()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port)
  })
}

function isAddressInUse(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === 'EADDRINUSE'
  )
}
