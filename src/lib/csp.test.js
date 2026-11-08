import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// The theme bootstrap <script> in index.html is inline, so vercel.json's CSP
// must allow it by sha256 hash. Any edit to that script (even whitespace)
// changes the hash; if vercel.json isn't updated the browser silently blocks
// the script in production and dark/stage-mode users get a white flash on
// every load. This test fails the moment they drift apart.

const root = fileURLToPath(new URL('../../', import.meta.url))
const html = readFileSync(`${root}index.html`, 'utf8')
const vercel = JSON.parse(readFileSync(`${root}vercel.json`, 'utf8'))

function inlineScripts(source) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  return [...source.matchAll(re)].map((m) => m[1]).filter((s) => s.trim())
}

function cspScriptSrc() {
  for (const rule of vercel.headers ?? []) {
    for (const h of rule.headers ?? []) {
      if (h.key.toLowerCase() === 'content-security-policy') {
        const directive = h.value.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))
        return directive ?? ''
      }
    }
  }
  return ''
}

describe('Content-Security-Policy', () => {
  it('allows every inline script in index.html by its exact sha256 hash', () => {
    const scriptSrc = cspScriptSrc()
    expect(scriptSrc).not.toBe('')
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    const scripts = inlineScripts(html)
    expect(scripts.length).toBeGreaterThan(0)
    for (const body of scripts) {
      const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
      expect(scriptSrc, `update vercel.json script-src to include ${hash}`).toContain(hash)
    }
  })
})
