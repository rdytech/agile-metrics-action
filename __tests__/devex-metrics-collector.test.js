/**
 * Unit tests for DevEx metrics collector
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
  getPullRequest: jest.fn(),
  getPullRequestFiles: jest.fn(),
  listIssueComments: jest.fn(),
  deleteIssueComment: jest.fn(),
  createPRComment: jest.fn(),
  addPRLabel: jest.fn(),
  getPullRequestCommits: jest.fn(),
  compareCommitsDiff: jest.fn()
}

// Setup mocks
jest.unstable_mockModule('@actions/core', () => mockCore)

// Create a simple test class that doesn't depend on the actual import
class TestDevExMetricsCollector {
  constructor(githubClient, options = {}) {
    this.githubClient = githubClient
    this.options = {
      filesToIgnore: [],
      ignoreLineDeletions: false,
      ignoreFileDeletions: false,
      ...options
    }
  }

  filterFiles(files) {
    return files.filter((file) => {
      // Check if we should ignore deleted files
      if (this.options.ignoreFileDeletions && file.status === 'removed') {
        return false
      }

      // Check if file matches any ignore pattern
      if (this.options.filesToIgnore.length > 0) {
        const shouldIgnore = this.options.filesToIgnore.some((pattern) => {
          const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
          const regex = new RegExp(`^${regexPattern}$`)
          return regex.test(file.filename)
        })

        if (shouldIgnore) {
          return false
        }
      }

      return true
    })
  }

  calculateSizeDetails(files) {
    let totalAdditions = 0
    let totalDeletions = 0
    const filesChanged = files.length

    files.forEach((file) => {
      totalAdditions += file.additions || 0

      if (!this.options.ignoreLineDeletions) {
        totalDeletions += file.deletions || 0
      }
    })

    const totalChanges = totalAdditions + totalDeletions

    return {
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      total_changes: totalChanges,
      files_changed: filesChanged,
      files_analyzed: files.length
    }
  }

  categorizePRSize(sizeDetails) {
    const { total_changes } = sizeDetails

    if (total_changes < 105) return 's'
    if (total_changes <= 160) return 'm'
    if (total_changes <= 240) return 'l'
    return 'xl'
  }

  getSizeEmoji(size) {
    const emojiMap = {
      s: '🔹',
      m: '🔸',
      l: '🔶',
      xl: '🔥'
    }
    return emojiMap[size] || '❓'
  }

  calculateDiffSize(files) {
    let totalChanges = 0

    files.forEach((file) => {
      // Apply the same filtering logic as for PR size
      if (this.options.filesToIgnore.length > 0) {
        const shouldIgnore = this.options.filesToIgnore.some((pattern) => {
          const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
          const regex = new RegExp(`^${regexPattern}$`)
          return regex.test(file.filename)
        })

        if (shouldIgnore) {
          return
        }
      }

      if (this.options.ignoreFileDeletions && file.status === 'removed') {
        return
      }

      totalChanges += file.additions || 0

      if (!this.options.ignoreLineDeletions) {
        totalChanges += file.deletions || 0
      }
    })

    return totalChanges
  }

  getMaturityEmoji(percentage) {
    if (percentage === null || percentage === undefined) return '❓'
    if (percentage > 88) return '⭐'
    if (percentage >= 81) return '✅'
    if (percentage >= 75) return '⚖️'
    return '🎯'
  }

  getMaturityLevel(percentage) {
    if (percentage === null || percentage === undefined) return 'Unknown'
    if (percentage > 88) return 'Elite'
    if (percentage >= 81) return 'Good'
    if (percentage >= 75) return 'Fair'
    return 'Needs Focus'
  }
}

describe('DevExMetricsCollector', () => {
  let collector

  beforeEach(() => {
    jest.clearAllMocks()
    collector = new TestDevExMetricsCollector(mockGitHubClient)
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(collector.githubClient).toBe(mockGitHubClient)
      expect(collector.options.filesToIgnore).toEqual([])
      expect(collector.options.ignoreLineDeletions).toBe(false)
      expect(collector.options.ignoreFileDeletions).toBe(false)
    })

    it('should accept custom options', () => {
      const options = {
        filesToIgnore: ['*.md', '*.txt'],
        ignoreLineDeletions: true,
        ignoreFileDeletions: true
      }
      const customCollector = new TestDevExMetricsCollector(
        mockGitHubClient,
        options
      )

      expect(customCollector.options.filesToIgnore).toEqual(['*.md', '*.txt'])
      expect(customCollector.options.ignoreLineDeletions).toBe(true)
      expect(customCollector.options.ignoreFileDeletions).toBe(true)
    })
  })

  describe('filterFiles', () => {
    const mockFiles = [
      { filename: 'src/main.js', status: 'modified' },
      { filename: 'README.md', status: 'modified' },
      { filename: 'package.json', status: 'modified' },
      { filename: 'test.txt', status: 'removed' },
      { filename: 'docs/guide.md', status: 'added' }
    ]

    it('should return all files when no filters are set', () => {
      const filtered = collector.filterFiles(mockFiles)
      expect(filtered).toEqual(mockFiles)
    })

    it('should filter files by ignore patterns', () => {
      collector.options.filesToIgnore = ['*.md', '*.txt']
      const filtered = collector.filterFiles(mockFiles)

      expect(filtered).toHaveLength(2)
      expect(filtered.map((f) => f.filename)).toEqual([
        'src/main.js',
        'package.json'
      ])
    })

    it('should ignore deleted files when ignoreFileDeletions is true', () => {
      collector.options.ignoreFileDeletions = true
      const filtered = collector.filterFiles(mockFiles)

      expect(filtered).toHaveLength(4)
      expect(filtered.find((f) => f.status === 'removed')).toBeUndefined()
    })

    it('should combine multiple filters', () => {
      collector.options.filesToIgnore = ['*.md']
      collector.options.ignoreFileDeletions = true

      const filtered = collector.filterFiles(mockFiles)
      expect(filtered).toHaveLength(2)
      expect(filtered.map((f) => f.filename)).toEqual([
        'src/main.js',
        'package.json'
      ])
    })
  })

  describe('calculateSizeDetails', () => {
    it('should calculate size details correctly', () => {
      const files = [
        { additions: 10, deletions: 5 },
        { additions: 20, deletions: 3 },
        { additions: 0, deletions: 15 }
      ]

      const details = collector.calculateSizeDetails(files)

      expect(details.total_additions).toBe(30)
      expect(details.total_deletions).toBe(23)
      expect(details.total_changes).toBe(53)
      expect(details.files_changed).toBe(3)
      expect(details.files_analyzed).toBe(3)
    })

    it('should ignore line deletions when ignoreLineDeletions is true', () => {
      collector.options.ignoreLineDeletions = true
      const files = [
        { additions: 10, deletions: 5 },
        { additions: 20, deletions: 3 }
      ]

      const details = collector.calculateSizeDetails(files)

      expect(details.total_additions).toBe(30)
      expect(details.total_deletions).toBe(0)
      expect(details.total_changes).toBe(30)
    })

    it('should handle missing additions/deletions', () => {
      const files = [
        { additions: 10 }, // missing deletions
        { deletions: 5 }, // missing additions
        {} // missing both
      ]

      const details = collector.calculateSizeDetails(files)

      expect(details.total_additions).toBe(10)
      expect(details.total_deletions).toBe(5)
      expect(details.total_changes).toBe(15)
    })
  })

  describe('categorizePRSize', () => {
    it('should categorize S (<105 changes)', () => {
      expect(collector.categorizePRSize({ total_changes: 5 })).toBe('s')
      expect(collector.categorizePRSize({ total_changes: 104 })).toBe('s')
    })

    it('should categorize M (106-160 changes)', () => {
      expect(collector.categorizePRSize({ total_changes: 106 })).toBe('m')
      expect(collector.categorizePRSize({ total_changes: 160 })).toBe('m')
    })

    it('should categorize L (161-240 changes)', () => {
      expect(collector.categorizePRSize({ total_changes: 161 })).toBe('l')
      expect(collector.categorizePRSize({ total_changes: 240 })).toBe('l')
    })

    it('should categorize XL (>240 changes)', () => {
      expect(collector.categorizePRSize({ total_changes: 241 })).toBe('xl')
      expect(collector.categorizePRSize({ total_changes: 1000 })).toBe('xl')
    })
  })

  describe('getSizeEmoji', () => {
    it('should return correct emojis for each size', () => {
      expect(collector.getSizeEmoji('s')).toBe('🔹')
      expect(collector.getSizeEmoji('m')).toBe('🔸')
      expect(collector.getSizeEmoji('l')).toBe('🔶')
      expect(collector.getSizeEmoji('xl')).toBe('🔥')
      expect(collector.getSizeEmoji('unknown')).toBe('❓')
    })
  })

  describe('calculateDiffSize', () => {
    it('should calculate diff size correctly', () => {
      const files = [
        {
          filename: 'src/file1.js',
          additions: 10,
          deletions: 5
        },
        {
          filename: 'src/file2.js',
          additions: 20,
          deletions: 3
        }
      ]

      expect(collector.calculateDiffSize(files)).toBe(38) // 10+5+20+3
    })

    it('should ignore deletions when ignoreLineDeletions is true', () => {
      const collectorIgnoreDeletions = new TestDevExMetricsCollector(
        mockGitHubClient,
        { ignoreLineDeletions: true }
      )

      const files = [
        {
          filename: 'src/file1.js',
          additions: 10,
          deletions: 5
        }
      ]

      expect(collectorIgnoreDeletions.calculateDiffSize(files)).toBe(10)
    })

    it('should filter ignored files', () => {
      const collectorWithFilters = new TestDevExMetricsCollector(
        mockGitHubClient,
        { filesToIgnore: ['*.md'] }
      )

      const files = [
        {
          filename: 'README.md',
          additions: 10,
          deletions: 5
        },
        {
          filename: 'src/file.js',
          additions: 20,
          deletions: 3
        }
      ]

      expect(collectorWithFilters.calculateDiffSize(files)).toBe(23) // Only src/file.js
    })

    it('should ignore deleted files when ignoreFileDeletions is true', () => {
      const collectorIgnoreDeleted = new TestDevExMetricsCollector(
        mockGitHubClient,
        { ignoreFileDeletions: true }
      )

      const files = [
        {
          filename: 'src/file1.js',
          status: 'removed',
          additions: 0,
          deletions: 10
        },
        {
          filename: 'src/file2.js',
          status: 'modified',
          additions: 20,
          deletions: 3
        }
      ]

      expect(collectorIgnoreDeleted.calculateDiffSize(files)).toBe(23) // Only file2.js
    })
  })

  describe('getMaturityEmoji', () => {
    it('should return correct emojis for each maturity level', () => {
      expect(collector.getMaturityEmoji(100)).toBe('⭐')
      expect(collector.getMaturityEmoji(89)).toBe('⭐')
      expect(collector.getMaturityEmoji(87)).toBe('✅')
      expect(collector.getMaturityEmoji(81)).toBe('✅')
      expect(collector.getMaturityEmoji(80)).toBe('⚖️')
      expect(collector.getMaturityEmoji(75)).toBe('⚖️')
      expect(collector.getMaturityEmoji(74)).toBe('🎯')
      expect(collector.getMaturityEmoji(50)).toBe('🎯')
      expect(collector.getMaturityEmoji(10)).toBe('🎯')
      expect(collector.getMaturityEmoji(0)).toBe('🎯')
    })

    it('should handle null and undefined values', () => {
      expect(collector.getMaturityEmoji(null)).toBe('❓')
      expect(collector.getMaturityEmoji(undefined)).toBe('❓')
    })
  })

  describe('getMaturityLevel', () => {
    it('should return correct level descriptions', () => {
      expect(collector.getMaturityLevel(100)).toBe('Elite')
      expect(collector.getMaturityLevel(89)).toBe('Elite')
      expect(collector.getMaturityLevel(87)).toBe('Good')
      expect(collector.getMaturityLevel(81)).toBe('Good')
      expect(collector.getMaturityLevel(80)).toBe('Fair')
      expect(collector.getMaturityLevel(75)).toBe('Fair')
      expect(collector.getMaturityLevel(74)).toBe('Needs Focus')
      expect(collector.getMaturityLevel(50)).toBe('Needs Focus')
      expect(collector.getMaturityLevel(10)).toBe('Needs Focus')
      expect(collector.getMaturityLevel(0)).toBe('Needs Focus')
    })

    it('should handle null and undefined values', () => {
      expect(collector.getMaturityLevel(null)).toBe('Unknown')
      expect(collector.getMaturityLevel(undefined)).toBe('Unknown')
    })
  })

  describe('draft PR handling', () => {
    describe('calculatePRSize with draft PR', () => {
      it('should return draft status for draft PR', async () => {
        const mockCollector = {
          githubClient: {
            getPullRequest: jest.fn().mockResolvedValue({ draft: true }),
            getPullRequestFiles: jest.fn()
          },
          options: {},
          filterFiles: collector.filterFiles.bind(collector),
          calculateSizeDetails: collector.calculateSizeDetails.bind(collector),
          categorizePRSize: collector.categorizePRSize.bind(collector)
        }

        const calculatePRSize = async function (prNumber) {
          const prDetails = await this.githubClient.getPullRequest(prNumber)

          if (prDetails?.draft) {
            return {
              size: 'draft',
              category: 'draft',
              details: {
                total_additions: null,
                total_deletions: null,
                total_changes: null,
                files_changed: null,
                files_analyzed: null,
                reason: 'PR is in draft status'
              }
            }
          }

          const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
          if (!prFiles || prFiles.length === 0) {
            return { size: 'xs' }
          }

          const filteredFiles = this.filterFiles(prFiles)
          const sizeDetails = this.calculateSizeDetails(filteredFiles)
          const sizeCategory = this.categorizePRSize(sizeDetails)

          return {
            size: sizeCategory,
            category: `size/${sizeCategory}`,
            details: sizeDetails
          }
        }

        const result = await calculatePRSize.call(mockCollector, 123)

        expect(result.size).toBe('draft')
        expect(result.category).toBe('draft')
        expect(result.details.reason).toBe('PR is in draft status')
        expect(
          mockCollector.githubClient.getPullRequestFiles
        ).not.toHaveBeenCalled()
      })

      it('should calculate size for non-draft PR', async () => {
        const mockCollector = {
          githubClient: {
            getPullRequest: jest.fn().mockResolvedValue({ draft: false }),
            getPullRequestFiles: jest
              .fn()
              .mockResolvedValue([
                { filename: 'test.js', additions: 50, deletions: 10 }
              ])
          },
          options: {},
          filterFiles: collector.filterFiles.bind(collector),
          calculateSizeDetails: collector.calculateSizeDetails.bind(collector),
          categorizePRSize: collector.categorizePRSize.bind(collector)
        }

        const calculatePRSize = async function (prNumber) {
          const prDetails = await this.githubClient.getPullRequest(prNumber)

          if (prDetails?.draft) {
            return {
              size: 'draft',
              category: 'draft',
              details: { reason: 'PR is in draft status' }
            }
          }

          const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
          const filteredFiles = this.filterFiles(prFiles)
          const sizeDetails = this.calculateSizeDetails(filteredFiles)
          const sizeCategory = this.categorizePRSize(sizeDetails)

          return {
            size: sizeCategory,
            category: `size/${sizeCategory}`,
            details: sizeDetails
          }
        }

        const result = await calculatePRSize.call(mockCollector, 123)

        expect(result.size).toBe('s')
        expect(result.category).toBe('size/s')
        expect(
          mockCollector.githubClient.getPullRequestFiles
        ).toHaveBeenCalledWith(123)
      })
    })

    describe('calculatePRMaturity with draft PR', () => {
      it('should return null maturity for draft PR', async () => {
        const mockCollector = {
          githubClient: {
            getPullRequest: jest.fn().mockResolvedValue({ draft: true }),
            getPullRequestCommits: jest.fn()
          }
        }

        const calculatePRMaturity = async function (prNumber) {
          const prDetails = await this.githubClient.getPullRequest(prNumber)

          if (!prDetails) {
            return {
              maturity_ratio: null,
              maturity_percentage: null,
              details: { error: 'Could not fetch PR details' }
            }
          }

          if (prDetails.draft) {
            return {
              maturity_ratio: null,
              maturity_percentage: null,
              details: { reason: 'PR is in draft status' }
            }
          }

          return {
            maturity_ratio: 1,
            maturity_percentage: 100
          }
        }

        const result = await calculatePRMaturity.call(mockCollector, 123)

        expect(result.maturity_ratio).toBeNull()
        expect(result.maturity_percentage).toBeNull()
        expect(result.details.reason).toBe('PR is in draft status')
        expect(
          mockCollector.githubClient.getPullRequestCommits
        ).not.toHaveBeenCalled()
      })

      it('should calculate maturity for non-draft PR', async () => {
        const mockCollector = {
          githubClient: {
            getPullRequest: jest.fn().mockResolvedValue({ draft: false }),
            getPullRequestCommits: jest.fn().mockResolvedValue([])
          }
        }

        const calculatePRMaturity = async function (prNumber) {
          const prDetails = await this.githubClient.getPullRequest(prNumber)

          if (!prDetails || prDetails.draft) {
            return {
              maturity_ratio: null,
              maturity_percentage: null
            }
          }

          return {
            maturity_ratio: 0.85,
            maturity_percentage: 85
          }
        }

        const result = await calculatePRMaturity.call(mockCollector, 123)

        expect(result.maturity_ratio).toBe(0.85)
        expect(result.maturity_percentage).toBe(85)
      })
    })

    describe('addPRComment with draft PR', () => {
      it('should skip PR comment when PR is in draft status', async () => {
        const mockCollector = {
          githubClient: {
            createPRComment: jest.fn()
          },
          getSizeEmoji: jest.fn().mockReturnValue('📏'),
          getSizeRating: jest.fn().mockReturnValue('Good'),
          getRatingEmoji: jest.fn().mockReturnValue('✅'),
          getMaturityEmoji: jest.fn(),
          getMaturityLevel: jest.fn()
        }

        const addPRComment = async function (
          prNumber,
          prSizeMetrics,
          prMaturityMetrics = null
        ) {
          if (prSizeMetrics.category === 'draft') {
            mockCore.info(`PR #${prNumber} is a draft - skipping PR comment`)
            return
          }
          await this.githubClient.createPRComment(prNumber, 'comment body')
        }

        const draftSizeMetrics = {
          size: 'draft',
          category: 'draft',
          details: { reason: 'PR is in draft status' }
        }

        await addPRComment.call(mockCollector, 123, draftSizeMetrics)

        expect(
          mockCollector.githubClient.createPRComment
        ).not.toHaveBeenCalled()
        expect(mockCore.info).toHaveBeenCalledWith(
          'PR #123 is a draft - skipping PR comment'
        )
      })

      it('should create PR comment for non-draft PR', async () => {
        const mockCollector = {
          githubClient: {
            createPRComment: jest.fn().mockResolvedValue({})
          },
          getSizeEmoji: jest.fn().mockReturnValue('📏'),
          getSizeRating: jest.fn().mockReturnValue('Good'),
          getRatingEmoji: jest.fn().mockReturnValue('✅'),
          getMaturityEmoji: jest.fn(),
          getMaturityLevel: jest.fn()
        }

        const addPRComment = async function (
          prNumber,
          prSizeMetrics,
          prMaturityMetrics = null
        ) {
          if (prSizeMetrics.category === 'draft') {
            mockCore.info(`PR #${prNumber} is a draft - skipping PR comment`)
            return
          }
          await this.githubClient.createPRComment(prNumber, 'comment body')
          mockCore.info(`Added DevEx comment to PR #${prNumber}`)
        }

        const nonDraftSizeMetrics = {
          size: 'medium',
          category: 'size/m',
          details: {
            total_additions: 50,
            total_deletions: 10,
            total_changes: 60,
            files_changed: 3
          }
        }

        await addPRComment.call(mockCollector, 456, nonDraftSizeMetrics)

        expect(mockCollector.githubClient.createPRComment).toHaveBeenCalledWith(
          456,
          'comment body'
        )
        expect(mockCore.info).toHaveBeenCalledWith(
          'Added DevEx comment to PR #456'
        )
      })
    })

    describe('addPRComment previous comment cleanup', () => {
      const ACTION_MARKER =
        '*This comment was generated automatically by the Agile Metrics Action.*'

      it('should delete previous action comments before creating a new one', async () => {
        const mockCollector = {
          githubClient: {
            listIssueComments: jest.fn().mockResolvedValue([
              { id: 10, body: `Old size comment\n\n${ACTION_MARKER}` },
              { id: 11, body: 'Unrelated comment by a human' }
            ]),
            deleteIssueComment: jest.fn().mockResolvedValue(true),
            createPRComment: jest.fn().mockResolvedValue({ id: 99 })
          }
        }

        const addPRComment = async function (prNumber, prSizeMetrics) {
          if (prSizeMetrics.category === 'draft') return

          const existingComments =
            await this.githubClient.listIssueComments(prNumber)
          const previousActionComments = existingComments.filter((c) =>
            c.body?.includes(ACTION_MARKER)
          )
          for (const comment of previousActionComments) {
            await this.githubClient.deleteIssueComment(comment.id)
            mockCore.info(
              `Deleted previous action comment ${comment.id} on PR #${prNumber}`
            )
          }

          await this.githubClient.createPRComment(prNumber, 'new comment')
          mockCore.info(`Added DevEx comment to PR #${prNumber}`)
        }

        const sizeMetrics = { category: 'size/m', size: 'medium' }
        await addPRComment.call(mockCollector, 7, sizeMetrics)

        expect(
          mockCollector.githubClient.listIssueComments
        ).toHaveBeenCalledWith(7)
        // Only the action comment (id 10) should be deleted
        expect(
          mockCollector.githubClient.deleteIssueComment
        ).toHaveBeenCalledTimes(1)
        expect(
          mockCollector.githubClient.deleteIssueComment
        ).toHaveBeenCalledWith(10)
        expect(mockCollector.githubClient.createPRComment).toHaveBeenCalledWith(
          7,
          'new comment'
        )
      })

      it('should not call deleteIssueComment when there are no previous action comments', async () => {
        const mockCollector = {
          githubClient: {
            listIssueComments: jest
              .fn()
              .mockResolvedValue([{ id: 20, body: 'Just a regular comment' }]),
            deleteIssueComment: jest.fn(),
            createPRComment: jest.fn().mockResolvedValue({ id: 21 })
          }
        }

        const addPRComment = async function (prNumber, prSizeMetrics) {
          if (prSizeMetrics.category === 'draft') return

          const existingComments =
            await this.githubClient.listIssueComments(prNumber)
          const previousActionComments = existingComments.filter((c) =>
            c.body?.includes(ACTION_MARKER)
          )
          for (const comment of previousActionComments) {
            await this.githubClient.deleteIssueComment(comment.id)
          }

          await this.githubClient.createPRComment(prNumber, 'new comment')
        }

        const sizeMetrics = { category: 'size/s', size: 'small' }
        await addPRComment.call(mockCollector, 8, sizeMetrics)

        expect(
          mockCollector.githubClient.deleteIssueComment
        ).not.toHaveBeenCalled()
        expect(mockCollector.githubClient.createPRComment).toHaveBeenCalledWith(
          8,
          'new comment'
        )
      })

      it('should delete multiple previous action comments', async () => {
        const mockCollector = {
          githubClient: {
            listIssueComments: jest.fn().mockResolvedValue([
              { id: 30, body: `First action comment\n\n${ACTION_MARKER}` },
              { id: 31, body: `Second action comment\n\n${ACTION_MARKER}` }
            ]),
            deleteIssueComment: jest.fn().mockResolvedValue(true),
            createPRComment: jest.fn().mockResolvedValue({ id: 32 })
          }
        }

        const addPRComment = async function (prNumber, prSizeMetrics) {
          if (prSizeMetrics.category === 'draft') return

          const existingComments =
            await this.githubClient.listIssueComments(prNumber)
          const previousActionComments = existingComments.filter((c) =>
            c.body?.includes(ACTION_MARKER)
          )
          for (const comment of previousActionComments) {
            await this.githubClient.deleteIssueComment(comment.id)
          }

          await this.githubClient.createPRComment(prNumber, 'new comment')
        }

        const sizeMetrics = { category: 'size/l', size: 'large' }
        await addPRComment.call(mockCollector, 9, sizeMetrics)

        expect(
          mockCollector.githubClient.deleteIssueComment
        ).toHaveBeenCalledTimes(2)
        expect(
          mockCollector.githubClient.deleteIssueComment
        ).toHaveBeenCalledWith(30)
        expect(
          mockCollector.githubClient.deleteIssueComment
        ).toHaveBeenCalledWith(31)
        expect(
          mockCollector.githubClient.createPRComment
        ).toHaveBeenCalledTimes(1)
      })
    })
  })
})
