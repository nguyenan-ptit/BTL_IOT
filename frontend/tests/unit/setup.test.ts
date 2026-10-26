import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('môi trường test', () => {
  it('chạy được Vitest và Zod', () => {
    expect(z.string().min(1).safeParse('101').success).toBe(true)
  })
})
