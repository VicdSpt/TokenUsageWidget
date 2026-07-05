import { describe, it, expect } from 'vitest'
import { parseUsageResponse } from '../src/main/oauth-usage'

describe('parseUsageResponse', () => {
  it('parses percent-scale utilization (0-100) with ISO reset dates', () => {
    const r = parseUsageResponse({
      five_hour: { utilization: 13, resets_at: '2026-07-05T18:00:00Z' },
      seven_day: { utilization: 29, resets_at: '2026-07-09T23:59:59Z' },
    })
    expect(r).not.toBeNull()
    expect(r!.sessionPercent).toBe(13)
    expect(r!.weeklyPercent).toBe(29)
    expect(r!.sessionResetsAt?.toISOString()).toBe('2026-07-05T18:00:00.000Z')
    expect(r!.weeklyResetsAt?.toISOString()).toBe('2026-07-09T23:59:59.000Z')
  })

  it('parses fraction-scale utilization (0-1 with decimals)', () => {
    const r = parseUsageResponse({
      five_hour: { utilization: 0.49, resets_at: '2026-07-05T18:00:00Z' },
      seven_day: { utilization: 0.29, resets_at: '2026-07-09T23:59:59Z' },
    })
    expect(r!.sessionPercent).toBe(49)
    expect(r!.weeklyPercent).toBe(29)
  })

  it('treats integer 0 and 1 as percent, not fraction', () => {
    const r = parseUsageResponse({
      five_hour: { utilization: 0, resets_at: null },
      seven_day: { utilization: 1, resets_at: null },
    })
    expect(r!.sessionPercent).toBe(0)
    expect(r!.weeklyPercent).toBe(1)
  })

  it('accepts unix-seconds reset timestamps', () => {
    const r = parseUsageResponse({
      five_hour: { utilization: 10, resets_at: 1783119600 },
      seven_day: { utilization: 20, resets_at: 1783641600 },
    })
    expect(r!.sessionResetsAt?.getTime()).toBe(1783119600 * 1000)
    expect(r!.weeklyResetsAt?.getTime()).toBe(1783641600 * 1000)
  })

  it('tolerates a missing window', () => {
    const r = parseUsageResponse({
      five_hour: { utilization: 42, resets_at: null },
    })
    expect(r!.sessionPercent).toBe(42)
    expect(r!.weeklyPercent).toBe(0)
    expect(r!.weeklyResetsAt).toBeNull()
  })

  it('returns null when neither window is present', () => {
    expect(parseUsageResponse({ foo: 'bar' })).toBeNull()
    expect(parseUsageResponse(null)).toBeNull()
    expect(parseUsageResponse('nope')).toBeNull()
  })

  it('clamps percentages to 0-100', () => {
    const r = parseUsageResponse({
      five_hour: { utilization: 250, resets_at: null },
      seven_day: { utilization: -5, resets_at: null },
    })
    expect(r!.sessionPercent).toBe(100)
    expect(r!.weeklyPercent).toBe(0)
  })
})
