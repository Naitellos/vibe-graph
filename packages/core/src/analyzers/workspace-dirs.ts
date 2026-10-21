import { dirname } from 'node:path'
import { glob } from 'tinyglobby'

/**
 * Resolve workspace globs (pnpm-workspace.yaml `packages`, package.json
 * `workspaces`) to the absolute directories that hold a package.json.
 *
 * Globs `<pattern>/package.json` instead of using `onlyDirectories`, because
 * tinyglobby never reports a symlinked directory as a match; every caller
 * skips directories without a package.json anyway. Negations stay directory
 * patterns so they prune the whole subtree, and a trailing `**` gets one more
 * segment since its base dir (`packages` for `packages/**`) is not a match.
 * Net result: the directories a symlink-following `onlyDirectories` glob
 * would return, minus those without a package.json.
 */
export async function globWorkspaceDirs(root: string, globs: readonly string[]): Promise<string[]> {
  const patterns = globs.map((g) => {
    if (g === '' || g.startsWith('!')) return g
    const dir = g.replace(/\/+$/, '')
    return dir === '**' || dir.endsWith('/**') ? `${dir}/*/package.json` : `${dir}/package.json`
  })
  const pkgJsonFiles = await glob(patterns, { cwd: root, absolute: true, expandDirectories: false })
  return pkgJsonFiles.map((file) => dirname(file))
}
