import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ancient from '../src/data/ancient.gen.json'
import core from '../src/data/radicals-core.json'

const root = path.resolve(import.meta.dirname, '..')
const ALLOWED = /^(public domain|cc0|cc[ -]by([ -]sa)?\b)/i
const radicals = new Set(core.stages.flatMap(s => s.radicals.map(r => r.r)))

describe('ancient forms', () => {
  it('has data', () => expect(Object.keys(ancient).length).toBeGreaterThan(40))
  it('every key is a core radical', () => {
    for (const k of Object.keys(ancient)) expect(radicals.has(k), k).toBe(true)
  })
  it('every form has a file, credit, allowed license and url', () => {
    for (const [k, v] of Object.entries(ancient)) {
      expect(v.char, k).toBeTruthy()
      expect(v.forms.length, k).toBeGreaterThan(0)
      const order = v.forms.map(f => ['oracle', 'bronze', 'seal'].indexOf(f.script))
      expect(order.every(i => i >= 0), k).toBe(true)
      expect([...order].sort(), k).toEqual(order)
      for (const f of v.forms) {
        const file = path.join(root, 'public', f.file)
        expect(fs.existsSync(file), f.file).toBe(true)
        const svg = fs.readFileSync(file, 'utf8')
        expect(svg).toMatch(/viewBox=/)
        expect(svg).not.toMatch(/<script|foreignObject/i)
        expect(f.author, f.file).toBeTruthy()
        expect(f.license, f.file).toMatch(ALLOWED)
        expect(f.url, f.file).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
      }
    }
  })
})
