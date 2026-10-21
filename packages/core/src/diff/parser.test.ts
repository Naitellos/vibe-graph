import { describe, expect, it } from 'vitest'
import { parseDiffText } from './parser.js'

describe('parseDiffText', () => {
  it('extracts modified file paths from unified diff', () => {
    const diff = `diff --git a/src/oracle.ts b/src/oracle.ts
index abc..def 100644
--- a/src/oracle.ts
+++ b/src/oracle.ts
@@ -1,3 +1,4 @@
 import { x } from 'y'
+import { z } from 'q'
`
    const result = parseDiffText(diff)
    expect(result.added).toEqual([])
    expect(result.modified).toEqual(['src/oracle.ts'])
    expect(result.deleted).toEqual([])
    expect(result.renamed).toEqual([])
  })

  it('detects new files (added)', () => {
    const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export const x = 1
`
    const result = parseDiffText(diff)
    expect(result.added).toEqual(['src/new.ts'])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
  })

  it('detects deleted files', () => {
    const diff = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index abc..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const old = 1
`
    const result = parseDiffText(diff)
    expect(result.deleted).toEqual(['src/gone.ts'])
    expect(result.modified).toEqual([])
  })

  it('detects renamed files', () => {
    const diff = `diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts
`
    const result = parseDiffText(diff)
    expect(result.renamed).toEqual([{ from: 'src/old.ts', to: 'src/new.ts' }])
    expect(result.modified).toEqual([])
  })

  it('handles multiple files in one diff', () => {
    const diff = `diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-x
+y
diff --git a/b.ts b/b.ts
new file mode 100644
index 0..1
--- /dev/null
+++ b/b.ts
@@ -0,0 +1 @@
+z
`
    const result = parseDiffText(diff)
    expect(result.modified).toEqual(['a.ts'])
    expect(result.added).toEqual(['b.ts'])
  })

  it('returns empty result for empty input', () => {
    const result = parseDiffText('')
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
    expect(result.renamed).toEqual([])
  })

  it('returns empty result for non-diff text', () => {
    const result = parseDiffText('not a diff\njust some text\n')
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
    expect(result.renamed).toEqual([])
  })

  it('allChangedFiles helper returns the union of paths', () => {
    const diff = `diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-x
+y
diff --git a/b.ts b/b.ts
new file mode 100644
index 0..1
--- /dev/null
+++ b/b.ts
@@ -0,0 +1 @@
+z
diff --git a/c.ts b/c.ts
deleted file mode 100644
index abc..0
--- a/c.ts
+++ /dev/null
@@ -1 +0,0 @@
-old
`
    const result = parseDiffText(diff)
    const { allChangedFiles } = result
    expect(allChangedFiles()).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })
})
