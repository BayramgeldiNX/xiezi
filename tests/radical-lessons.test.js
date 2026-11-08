import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import core from '../src/data/radicals-core.json'

const chars = JSON.parse(fs.readFileSync(new URL('../public/dict/chars.json', import.meta.url), 'utf8'))
const radicals = core.stages.flatMap((s) => s.radicals)

describe('radical lessons', () => {
  it('covers all 81 radicals', () => {
    expect(radicals).toHaveLength(81)
  })

  for (const x of radicals) {
    describe(`${x.r} ${x.en}`, () => {
      const L = x.lesson
      const forms = new Set([x.r, x.full, ...x.variants])
      const inFamily = (c) => chars[c] && forms.has(chars[c][2])

      it('has story and picture', () => {
        expect(L).toBeTruthy()
        expect(L.story.length).toBeGreaterThan(40)
        expect(L.picture.split(/\s+/).length).toBeGreaterThanOrEqual(4)
        expect(L.picture.split(/\s+/).length).toBeLessThanOrEqual(14)
      })

      it('has 2 part characters that belong to the radical', () => {
        expect(L.part).toHaveLength(2)
        for (const c of L.part) expect(inFamily(c), `part ${c}`).toBe(true)
      })

      it('has 4 why characters with pinyin from the dictionary', () => {
        expect(L.why).toHaveLength(4)
        for (const w of L.why) {
          expect(inFamily(w.c), `why ${w.c}`).toBe(true)
          expect(w.py).toBe(chars[w.c][0])
          expect(w.en).toBeTruthy()
          expect(w.why.split(/\s+/).length).toBeLessThanOrEqual(12)
        }
      })

      it('has sound examples that are real pictophonetic characters', () => {
        expect(Array.isArray(L.sound)).toBe(true)
        if (x.kind === 'meaning') expect(L.sound).toHaveLength(2)
        for (const s of L.sound) {
          expect(inFamily(s.c), `sound ${s.c}`).toBe(true)
          expect(chars[s.c][4]).toBe('pictophonetic')
          expect(chars[s.c][5]).toBe(s.sound)
          expect(s.py).toBe(chars[s.c][0])
          expect(s.soundPy).toBe(chars[s.sound][0])
          expect(s.en).toBeTruthy()
        }
      })

      it(x.kind === 'shape' ? 'explains when it is only a shape' : 'has no shape note', () => {
        if (x.kind === 'shape') expect(L.shape.length).toBeGreaterThan(20)
        else expect(L.shape).toBeUndefined()
      })
    })
  }
})
