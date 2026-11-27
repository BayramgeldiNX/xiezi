import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = {}
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: (k) => { delete store[k] } }

let P
beforeEach(async () => {
  for (const k in store) delete store[k]
  vi.resetModules()
  P = await import('../src/lib/profile.js')
})

describe('profile', () => {
  it('trims the nickname and caps it at 20 characters', () => {
    P.setProfile({ nick: '  Bayram  ' })
    expect(P.getProfile().nick).toBe('Bayram')
    P.setProfile({ nick: 'x'.repeat(40) })
    expect(P.getProfile().nick).toHaveLength(20)
    expect(P.getProfile().at).toBeGreaterThan(0)
  })
  it('keeps the photo when only the nickname changes', () => {
    P.setProfile({ photo: 'data:image/webp;base64,AA' })
    P.setProfile({ nick: 'A' })
    expect(P.getProfile().photo).toBe('data:image/webp;base64,AA')
  })
  it('accepts a newer remote profile and ignores an older one', () => {
    P.setProfile({ nick: 'Local' })
    const at = P.getProfile().at
    expect(P.applyRemoteProfile({ nick: 'Old', photo: null, at: at - 1 })).toBe(false)
    expect(P.getProfile().nick).toBe('Local')
    expect(P.applyRemoteProfile({ nick: 'New', photo: null, at: at + 5 })).toBe(true)
    expect(P.getProfile().nick).toBe('New')
  })
  it('pushes on setProfile but not on applyRemoteProfile', () => {
    const push = vi.fn()
    P.setProfilePush(push)
    P.setProfile({ nick: 'A' })
    expect(push).toHaveBeenCalledTimes(1)
    P.applyRemoteProfile({ nick: 'B', photo: null, at: Date.now() + 1000 })
    expect(push).toHaveBeenCalledTimes(1)
  })
  it('notifies listeners and can unsubscribe', () => {
    const fn = vi.fn()
    const off = P.onProfile(fn)
    P.setProfile({ nick: 'A' })
    off()
    P.setProfile({ nick: 'B' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('initial()', () => {
    expect(P.initial('bayram')).toBe('B')
    expect(P.initial('小明')).toBe('小')
    expect(P.initial('')).toBe('我')
    expect(P.initial('  ')).toBe('我')
  })
})
