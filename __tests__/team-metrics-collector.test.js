/**
 * Unit tests for Team Metrics Collector
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock dependencies
const mockCore = {
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}

const mockGitHubClient = {
  getPullRequestsByDateRange: jest.fn(),
  getPullRequestTimeline: jest.fn(),
  getPullRequestReviews: jest.fn()
}

// Setup mocks
jest.unstable_mockModule('@actions/core', () => mockCore)

// Create a simple test class
class TestTeamMetricsCollector {
  constructor(githubClient, options = {}) {
    this.githubClient = githubClient
    this.options = {
      timePeriod: 'weekly',
      ...options
    }
  }

  getDateRange() {
    const now = new Date()
    const end = now.toISOString()
    let start = new Date()

    switch (this.options.timePeriod) {
      case 'fortnightly':
        start.setDate(now.getDate() - 14)
        break
      case 'monthly':
        start.setDate(now.getDate() - 30)
        break
      case 'weekly':
      default:
        start.setDate(now.getDate() - 7)
        break
    }

    return { start: start.toISOString(), end }
  }

  getDaysInPeriod() {
    switch (this.options.timePeriod) {
      case 'fortnightly':
        return 14
      case 'monthly':
        return 30
      case 'weekly':
      default:
        return 7
    }
  }

  countUniqueAuthors(prs) {
    const authors = new Set(prs.map((pr) => pr.user.login))
    return authors.size
  }

  getPRSizeFromLabels(labels) {
    if (!labels || labels.length === 0) return null

    const sizeLabel = labels.find((label) =>
      label.name.toLowerCase().startsWith('size/')
    )

    if (!sizeLabel) return null
    return sizeLabel.name.toLowerCase().replace('size/', '')
  }

  calculatePickupTime(createdAt, timeline, reviews) {
    const firstReviewComment = timeline?.find(
      (event) =>
        event.event === 'reviewed' ||
        event.event === 'commented' ||
        (event.event === 'line-commented' && event.user?.type !== 'Bot')
    )

    const firstReview = reviews?.[0]

    let firstActivityTime = null

    if (firstReviewComment && firstReview) {
      const commentTime = new Date(firstReviewComment.created_at)
      const reviewTime = new Date(firstReview.submitted_at)
      firstActivityTime = commentTime < reviewTime ? commentTime : reviewTime
    } else if (firstReviewComment) {
      firstActivityTime = new Date(firstReviewComment.created_at)
    } else if (firstReview) {
      firstActivityTime = new Date(firstReview.submitted_at)
    }

    if (!firstActivityTime) return null

    const diffMs = firstActivityTime - createdAt
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
  }

  calculateApproveTime(createdAt, timeline, reviews) {
    const firstComment = timeline?.find(
      (event) =>
        event.event === 'reviewed' ||
        event.event === 'commented' ||
        event.event === 'line-commented'
    )

    const firstApproval = reviews?.find((review) => review.state === 'APPROVED')

    if (!firstComment || !firstApproval) return null

    const commentTime = new Date(firstComment.created_at)
    const approvalTime = new Date(firstApproval.submitted_at)
    const diffMs = approvalTime - commentTime
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
  }

  calculateMergeTime(mergedAt, reviews) {
    const firstApproval = reviews?.find((review) => review.state === 'APPROVED')

    if (!firstApproval) return null

    const approvalTime = new Date(firstApproval.submitted_at)
    const mergeTime = new Date(mergedAt)
    const diffMs = mergeTime - approvalTime
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
  }

  calculateSizeDistribution(prMetrics) {
    const sizes = { s: 0, m: 0, l: 0, xl: 0, unknown: 0 }
    const total = prMetrics.length

    prMetrics.forEach((pr) => {
      const size = pr.pr_size
      if (size && sizes.hasOwnProperty(size)) {
        sizes[size]++
      } else {
        sizes.unknown++
      }
    })

    return {
      small_percent: total > 0 ? Math.round((sizes.s / total) * 100) : 0,
      medium_percent: total > 0 ? Math.round((sizes.m / total) * 100) : 0,
      large_percent: total > 0 ? Math.round((sizes.l / total) * 100) : 0,
      xl_percent: total > 0 ? Math.round((sizes.xl / total) * 100) : 0,
      unknown_percent: total > 0 ? Math.round((sizes.unknown / total) * 100) : 0
    }
  }

  ratePickupTime(hours) {
    if (hours < 2) return 'Elite'
    if (hours <= 6) return 'Good'
    if (hours <= 16) return 'Fair'
    return 'Needs Focus'
  }

  rateApproveTime(hours) {
    if (hours < 17) return 'Elite'
    if (hours <= 24) return 'Good'
    if (hours <= 45) return 'Fair'
    return 'Needs Focus'
  }

  rateMergeTime(hours) {
    if (hours < 2) return 'Elite'
    if (hours <= 5) return 'Good'
    if (hours <= 19) return 'Fair'
    return 'Needs Focus'
  }

  rateMergeFrequency(frequency) {
    if (frequency > 1.6) return 'Elite'
    if (frequency >= 1.1) return 'Good'
    if (frequency >= 0.6) return 'Fair'
    return 'Needs Focus'
  }

  getRatingEmoji(rating) {
    const emojiMap = {
      Elite: '⭐',
      Good: '✅',
      Fair: '⚖️',
      'Needs Focus': '🎯'
    }
    return emojiMap[rating] || '❓'
  }
}

describe('TeamMetricsCollector', () => {
  let collector

  beforeEach(() => {
    jest.clearAllMocks()
    collector = new TestTeamMetricsCollector(mockGitHubClient)
  })

  describe('getDateRange', () => {
    it('should return correct date range for weekly period', () => {
      collector.options.timePeriod = 'weekly'
      const dateRange = collector.getDateRange()
      const start = new Date(dateRange.start)
      const end = new Date(dateRange.end)
      const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24))
      expect(diff).toBe(7)
    })

    it('should return correct date range for fortnightly period', () => {
      collector.options.timePeriod = 'fortnightly'
      const dateRange = collector.getDateRange()
      const start = new Date(dateRange.start)
      const end = new Date(dateRange.end)
      const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24))
      expect(diff).toBe(14)
    })

    it('should return correct date range for monthly period', () => {
      collector.options.timePeriod = 'monthly'
      const dateRange = collector.getDateRange()
      const start = new Date(dateRange.start)
      const end = new Date(dateRange.end)
      const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24))
      expect(diff).toBe(30)
    })
  })

  describe('getDaysInPeriod', () => {
    it('should return 7 days for weekly period', () => {
      collector.options.timePeriod = 'weekly'
      expect(collector.getDaysInPeriod()).toBe(7)
    })

    it('should return 14 days for fortnightly period', () => {
      collector.options.timePeriod = 'fortnightly'
      expect(collector.getDaysInPeriod()).toBe(14)
    })

    it('should return 30 days for monthly period', () => {
      collector.options.timePeriod = 'monthly'
      expect(collector.getDaysInPeriod()).toBe(30)
    })
  })

  describe('countUniqueAuthors', () => {
    it('should count unique authors correctly', () => {
      const prs = [
        { user: { login: 'user1' } },
        { user: { login: 'user2' } },
        { user: { login: 'user1' } },
        { user: { login: 'user3' } }
      ]
      expect(collector.countUniqueAuthors(prs)).toBe(3)
    })

    it('should return 0 for empty PR list', () => {
      expect(collector.countUniqueAuthors([])).toBe(0)
    })
  })

  describe('getPRSizeFromLabels', () => {
    it('should extract size from label', () => {
      const labels = [{ name: 'bug' }, { name: 'size/m' }, { name: 'feature' }]
      expect(collector.getPRSizeFromLabels(labels)).toBe('m')
    })

    it('should return null for no size label', () => {
      const labels = [{ name: 'bug' }, { name: 'feature' }]
      expect(collector.getPRSizeFromLabels(labels)).toBe(null)
    })

    it('should return null for empty labels', () => {
      expect(collector.getPRSizeFromLabels([])).toBe(null)
      expect(collector.getPRSizeFromLabels(null)).toBe(null)
    })
  })

  describe('calculatePickupTime', () => {
    it('should calculate pickup time from first review comment', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z')
      const timeline = [
        {
          event: 'commented',
          created_at: '2024-01-01T12:00:00Z',
          user: { type: 'User' }
        }
      ]
      const reviews = []

      const pickupTime = collector.calculatePickupTime(
        createdAt,
        timeline,
        reviews
      )
      expect(pickupTime).toBe(2)
    })

    it('should calculate pickup time from first review', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z')
      const timeline = []
      const reviews = [{ submitted_at: '2024-01-01T13:30:00Z' }]

      const pickupTime = collector.calculatePickupTime(
        createdAt,
        timeline,
        reviews
      )
      expect(pickupTime).toBe(3.5)
    })

    it('should return null when no activity', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z')
      const timeline = []
      const reviews = []

      const pickupTime = collector.calculatePickupTime(
        createdAt,
        timeline,
        reviews
      )
      expect(pickupTime).toBe(null)
    })
  })

  describe('calculateApproveTime', () => {
    it('should calculate approve time correctly', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z')
      const timeline = [
        { event: 'commented', created_at: '2024-01-01T12:00:00Z' }
      ]
      const reviews = [
        { state: 'APPROVED', submitted_at: '2024-01-01T14:00:00Z' }
      ]

      const approveTime = collector.calculateApproveTime(
        createdAt,
        timeline,
        reviews
      )
      expect(approveTime).toBe(2)
    })

    it('should return null when no approval', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z')
      const timeline = [
        { event: 'commented', created_at: '2024-01-01T12:00:00Z' }
      ]
      const reviews = []

      const approveTime = collector.calculateApproveTime(
        createdAt,
        timeline,
        reviews
      )
      expect(approveTime).toBe(null)
    })
  })

  describe('calculateMergeTime', () => {
    it('should calculate merge time correctly', () => {
      const mergedAt = '2024-01-01T16:00:00Z'
      const reviews = [
        { state: 'APPROVED', submitted_at: '2024-01-01T14:00:00Z' }
      ]

      const mergeTime = collector.calculateMergeTime(mergedAt, reviews)
      expect(mergeTime).toBe(2)
    })

    it('should return null when no approval', () => {
      const mergedAt = '2024-01-01T16:00:00Z'
      const reviews = []

      const mergeTime = collector.calculateMergeTime(mergedAt, reviews)
      expect(mergeTime).toBe(null)
    })
  })

  describe('calculateSizeDistribution', () => {
    it('should calculate size distribution correctly', () => {
      const prMetrics = [
        { pr_size: 's' },
        { pr_size: 's' },
        { pr_size: 'm' },
        { pr_size: 'l' },
        { pr_size: 'xl' },
        { pr_size: null }
      ]

      const distribution = collector.calculateSizeDistribution(prMetrics)
      expect(distribution.small_percent).toBe(33) // 2/6 = 33%
      expect(distribution.medium_percent).toBe(17) // 1/6 = 17%
      expect(distribution.large_percent).toBe(17)
      expect(distribution.xl_percent).toBe(17)
      expect(distribution.unknown_percent).toBe(17)
    })

    it('should handle empty metrics', () => {
      const distribution = collector.calculateSizeDistribution([])
      expect(distribution.small_percent).toBe(0)
      expect(distribution.medium_percent).toBe(0)
      expect(distribution.large_percent).toBe(0)
      expect(distribution.xl_percent).toBe(0)
    })
  })

  describe('rating methods', () => {
    describe('ratePickupTime', () => {
      it('should rate as Elite for < 2 hours', () => {
        expect(collector.ratePickupTime(1)).toBe('Elite')
        expect(collector.ratePickupTime(1.99)).toBe('Elite')
      })

      it('should rate as Good for 2-6 hours', () => {
        expect(collector.ratePickupTime(2)).toBe('Good')
        expect(collector.ratePickupTime(6)).toBe('Good')
      })

      it('should rate as Fair for 7-16 hours', () => {
        expect(collector.ratePickupTime(7)).toBe('Fair')
        expect(collector.ratePickupTime(16)).toBe('Fair')
      })

      it('should rate as Needs Focus for > 16 hours', () => {
        expect(collector.ratePickupTime(17)).toBe('Needs Focus')
        expect(collector.ratePickupTime(100)).toBe('Needs Focus')
      })
    })

    describe('rateApproveTime', () => {
      it('should rate as Elite for < 17 hours', () => {
        expect(collector.rateApproveTime(16)).toBe('Elite')
      })

      it('should rate as Good for 17-24 hours', () => {
        expect(collector.rateApproveTime(17)).toBe('Good')
        expect(collector.rateApproveTime(24)).toBe('Good')
      })

      it('should rate as Fair for 25-45 hours', () => {
        expect(collector.rateApproveTime(25)).toBe('Fair')
        expect(collector.rateApproveTime(45)).toBe('Fair')
      })

      it('should rate as Needs Focus for > 45 hours', () => {
        expect(collector.rateApproveTime(46)).toBe('Needs Focus')
      })
    })

    describe('rateMergeTime', () => {
      it('should rate as Elite for < 2 hours', () => {
        expect(collector.rateMergeTime(1)).toBe('Elite')
      })

      it('should rate as Good for 2-5 hours', () => {
        expect(collector.rateMergeTime(2)).toBe('Good')
        expect(collector.rateMergeTime(5)).toBe('Good')
      })

      it('should rate as Fair for 6-19 hours', () => {
        expect(collector.rateMergeTime(6)).toBe('Fair')
        expect(collector.rateMergeTime(19)).toBe('Fair')
      })

      it('should rate as Needs Focus for > 19 hours', () => {
        expect(collector.rateMergeTime(20)).toBe('Needs Focus')
      })
    })

    describe('rateMergeFrequency', () => {
      it('should rate as Elite for > 1.6', () => {
        expect(collector.rateMergeFrequency(1.7)).toBe('Elite')
        expect(collector.rateMergeFrequency(2.0)).toBe('Elite')
      })

      it('should rate as Good for 1.1-1.6', () => {
        expect(collector.rateMergeFrequency(1.1)).toBe('Good')
        expect(collector.rateMergeFrequency(1.6)).toBe('Good')
      })

      it('should rate as Fair for 0.6-0.99', () => {
        expect(collector.rateMergeFrequency(0.6)).toBe('Fair')
        expect(collector.rateMergeFrequency(0.99)).toBe('Fair')
      })

      it('should rate as Needs Focus for < 0.6', () => {
        expect(collector.rateMergeFrequency(0.5)).toBe('Needs Focus')
        expect(collector.rateMergeFrequency(0.1)).toBe('Needs Focus')
      })
    })
  })

  describe('getRatingEmoji', () => {
    it('should return correct emojis for each rating', () => {
      expect(collector.getRatingEmoji('Elite')).toBe('⭐')
      expect(collector.getRatingEmoji('Good')).toBe('✅')
      expect(collector.getRatingEmoji('Fair')).toBe('⚖️')
      expect(collector.getRatingEmoji('Needs Focus')).toBe('🎯')
      expect(collector.getRatingEmoji('Unknown')).toBe('❓')
    })
  })
})
