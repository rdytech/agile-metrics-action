/**
 * Unit tests for utility functions
 */

import { describe, it, expect } from '@jest/globals'
import {
  toISOString,
  hoursBetween,
  daysBetween,
  formatHoursToDays,
  validatePositiveInteger,
  validateBoolean,
  sanitizeFilePath
} from '../src/utils.js'

describe('utils', () => {
  describe('toISOString', () => {
    it('should convert date to ISO string', () => {
      const date = new Date('2023-01-01T12:00:00Z')
      expect(toISOString(date)).toBe('2023-01-01T12:00:00.000Z')
    })

    it('should handle string input', () => {
      expect(toISOString('2023-01-01T12:00:00Z')).toBe(
        '2023-01-01T12:00:00.000Z'
      )
    })
  })

  describe('hoursBetween', () => {
    it('should calculate hours between dates correctly', () => {
      const later = new Date('2023-01-01T12:00:00Z')
      const earlier = new Date('2023-01-01T10:00:00Z')
      expect(hoursBetween(later, earlier)).toBe(2)
    })

    it('should handle negative values', () => {
      const later = new Date('2023-01-01T10:00:00Z')
      const earlier = new Date('2023-01-01T12:00:00Z')
      expect(hoursBetween(later, earlier)).toBe(-2)
    })
  })

  describe('daysBetween', () => {
    it('should calculate days between dates correctly', () => {
      const later = new Date('2023-01-03T00:00:00Z')
      const earlier = new Date('2023-01-01T00:00:00Z')
      expect(daysBetween(later, earlier)).toBe(2)
    })

    it('should handle fractional days', () => {
      const later = new Date('2023-01-02T12:00:00Z')
      const earlier = new Date('2023-01-01T00:00:00Z')
      expect(daysBetween(later, earlier)).toBe(1.5)
    })
  })

  describe('formatHoursToDays', () => {
    it('should format hours to days and hours', () => {
      expect(formatHoursToDays(25)).toBe('1.0 days (25h)')
    })

    it('should handle null values', () => {
      expect(formatHoursToDays(null)).toBe('N/A')
    })

    it('should handle small values', () => {
      expect(formatHoursToDays(0.05)).toBe('0.0 days (0.1h)')
    })
  })

  describe('validatePositiveInteger', () => {
    it('should validate positive integers', () => {
      expect(validatePositiveInteger('100', 'test')).toBe(100)
      expect(validatePositiveInteger('1', 'test')).toBe(1)
    })

    it('should throw error for non-positive integers', () => {
      expect(() => validatePositiveInteger('0', 'test')).toThrow(
        'test must be a positive integer, got: 0'
      )
      expect(() => validatePositiveInteger('-1', 'test')).toThrow(
        'test must be a positive integer, got: -1'
      )
    })

    it('should throw error for non-numeric values', () => {
      expect(() => validatePositiveInteger('abc', 'test')).toThrow(
        'test must be a positive integer, got: abc'
      )
    })
  })

  describe('validateBoolean', () => {
    it('should validate true/false strings', () => {
      expect(validateBoolean('true', 'test')).toBe(true)
      expect(validateBoolean('false', 'test')).toBe(false)
      expect(validateBoolean('TRUE', 'test')).toBe(true)
      expect(validateBoolean('FALSE', 'test')).toBe(false)
    })

    it('should throw error for invalid boolean strings', () => {
      expect(() => validateBoolean('yes', 'test')).toThrow(
        "test must be 'true' or 'false', got: yes"
      )
    })
  })

  describe('sanitizeFilePath', () => {
    it('should allow normal file paths', () => {
      expect(sanitizeFilePath('metrics/file.json')).toBe('metrics/file.json')
      expect(sanitizeFilePath('/absolute/path/file.json')).toBe(
        '/absolute/path/file.json'
      )
    })

    it('should prevent directory traversal', () => {
      expect(() => sanitizeFilePath('../../../etc/passwd')).toThrow(
        'Invalid file path: ../../../etc/passwd'
      )
      expect(() => sanitizeFilePath('safe/../../../etc/passwd')).toThrow(
        'Invalid file path: safe/../../../etc/passwd'
      )
    })
  })
})
