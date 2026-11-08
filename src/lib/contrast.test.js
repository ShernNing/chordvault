import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// WCAG AA text contrast for the theme tokens. Theme values live in three
// places that must stay in sync: index.css (:root / .dark / .stage-mode),
// the inline bootstrap script in index.html, and DARK_THEMES in hooks.js.
// This parses all three (no app imports) so a token tweak can't silently
// regress below 4.5:1.

const root = fileURLToPath(new URL('../../', import.meta.url))
const css = readFileSync(`${root}src/index.css`, 'utf8')
const html = readFileSync(`${root}index.html`, 'utf8')
const hooks = readFileSync(`${root}src/lib/hooks.js`, 'utf8')

function cssBlock(selector) {
  const re = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`)
  const m = css.match(re)
  if (!m) throw new Error(`no ${selector} block in index.css`)
  const vars = {}
  for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
  return vars
}

function darkThemes() {
  const start = hooks.indexOf('export const DARK_THEMES = [')
  const end = hooks.indexOf('\n]\n', start)
  const src = hooks.slice(start + 'export const DARK_THEMES = '.length, end + 2)
  return new Function(`return ${src}`)()
}

function htmlThemes() {
  const start = html.indexOf('var themes = {')
  const end = html.indexOf('};', start)
  return new Function(`return ${html.slice(start + 'var themes = '.length, end + 1)}`)()
}

function htmlStageColors() {
  const start = html.indexOf('var stageColors = {')
  const end = html.indexOf('};', start)
  return new Function(`return ${html.slice(start + 'var stageColors = '.length, end + 1)}`)()
}

const hex = (h) => {
  let s = h.trim().replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function resolve(vars, value) {
  const m = /^var\((--[\w-]+)\)$/.exec(value)
  return m ? resolve(vars, vars[m[1]]) : value
}

const base = cssBlock(':root')
const dark = { ...base, ...cssBlock('.dark') }
const stageBase = { ...dark, ...cssBlock('.stage-mode') }

const themes = { light: base, slate: dark }
for (const t of darkThemes()) if (t.vars) themes[t.id] = { ...dark, ...t.vars }
for (const [id, [chord]] of Object.entries(htmlStageColors())) {
  themes[`stage-${id}`] = { ...stageBase, '--color-accent': chord }
}

describe('theme token contrast (WCAG AA 4.5:1)', () => {
  for (const [name, vars] of Object.entries(themes)) {
    const v = (k) => resolve(vars, vars[k])
    it(`${name}: --color-ink-muted on bg and bg-warm`, () => {
      expect(ratio(v('--color-ink-muted'), v('--color-bg'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(v('--color-ink-muted'), v('--color-bg-warm'))).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name}: --color-accent-text on bg, bg-warm and accent-soft`, () => {
      expect(v('--color-accent-text')).toBeTruthy()
      expect(ratio(v('--color-accent-text'), v('--color-bg'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(v('--color-accent-text'), v('--color-bg-warm'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(v('--color-accent-text'), v('--color-accent-soft'))).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('theme definitions stay in sync', () => {
  it('index.html bootstrap themes match hooks.js DARK_THEMES', () => {
    const fromHooks = Object.fromEntries(darkThemes().filter((t) => t.vars).map((t) => [t.id, t.vars]))
    expect(htmlThemes()).toEqual(fromHooks)
  })
})
