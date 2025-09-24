import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const mockGitHubClient = {
  getPullRequest: jest.fn(),
  getPullRequestCommits: jest.fn(),
  getPullRequestFiles: jest.fn(),
  compareCommitsDiff: jest.fn()
}

const mockCore = {
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
  setFailed: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    write: jest.fn().mockReturnThis()
  }
}

// Mock the @actions/core module for testing
jest.unstable_mockModule('@actions/core', () => mockCore)

// Simple test class to debug the maturity calculation
class TestDevExMatricsCollector {
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
      if (this.options.ignoreFileDeletions && file.status === 'removed') {
        return false
      }

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
    let total_additions = 0
    let total_deletions = 0

    for (const file of files) {
      total_additions += file.additions || 0
      if (!this.options.ignoreLineDeletions) {
        total_deletions += file.deletions || 0
      }
    }

    return {
      total_additions,
      total_deletions,
      total_changes: total_additions + total_deletions
    }
  }

  calculateDiffSize(files) {
    let changes = 0
    for (const file of files) {
      changes += (file.additions || 0) + (file.deletions || 0)
    }
    return changes
  }

  async calculatePRMaturity(prNumber) {
    try {
      console.log(`=== Debugging PR Maturity for PR #${prNumber} ===`)

      const prDetails = await this.githubClient.getPullRequest(prNumber)
      if (!prDetails) {
        console.log('❌ Could not fetch PR details')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: { error: 'Could not fetch PR details' }
        }
      }

      const prCommits = await this.githubClient.getPullRequestCommits(prNumber)
      console.log(`📝 Found ${prCommits?.length || 0} commits`)

      if (!prCommits || prCommits.length === 0) {
        console.log('❌ No commits found in PR')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: { error: 'No commits found in PR' }
        }
      }

      // Get PR creation time
      const prCreatedAt = new Date(prDetails.created_at)
      console.log(`📅 PR created at: ${prCreatedAt.toISOString()}`)

      // Single commit case
      if (prCommits.length === 1) {
        const commitDate = new Date(prCommits[0].commit.author.date)
        const timeDiffMinutes = (commitDate - prCreatedAt) / (1000 * 60)

        console.log(
          `⏰ Single commit time difference: ${timeDiffMinutes.toFixed(2)} minutes`
        )

        const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
        const filteredFiles = this.filterFiles(prFiles || [])
        const sizeDetails = this.calculateSizeDetails(filteredFiles)

        console.log(`✅ Single commit - 100% maturity`)
        console.log(`📊 Total changes: ${sizeDetails.total_changes}`)

        return {
          maturity_ratio: 1.0,
          maturity_percentage: 100,
          details: {
            total_commits: 1,
            total_changes: sizeDetails.total_changes,
            changes_after_publication: 0,
            stable_changes: sizeDetails.total_changes,
            first_commit_sha: prCommits[0].sha,
            last_commit_sha: prCommits[0].sha,
            pr_created_at: prCreatedAt.toISOString(),
            reason: 'Single commit PR'
          }
        }
      }

      // Check for commits within grace period
      const commitsWithinGracePeriod = prCommits.filter((commit) => {
        const commitDate = new Date(commit.commit.author.date)
        const timeDiffMinutes = Math.abs(commitDate - prCreatedAt) / (1000 * 60)
        return timeDiffMinutes <= 5 || commitDate <= prCreatedAt
      })

      console.log(
        `🕐 Commits within grace period: ${commitsWithinGracePeriod.length}/${prCommits.length}`
      )

      if (commitsWithinGracePeriod.length === prCommits.length) {
        const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
        const filteredFiles = this.filterFiles(prFiles || [])
        const sizeDetails = this.calculateSizeDetails(filteredFiles)

        console.log(`✅ All commits within grace period - 100% maturity`)

        return {
          maturity_ratio: 1.0,
          maturity_percentage: 100,
          details: {
            total_commits: prCommits.length,
            total_changes: sizeDetails.total_changes,
            changes_after_publication: 0,
            stable_changes: sizeDetails.total_changes,
            first_commit_sha: prCommits[0].sha,
            last_commit_sha: prCommits[prCommits.length - 1].sha,
            pr_created_at: prCreatedAt.toISOString(),
            reason: 'All commits within grace period or pre-existing'
          }
        }
      }

      // Find significant commits after PR creation
      const significantCommitsAfterPR = prCommits.filter((commit) => {
        const commitDate = new Date(commit.commit.author.date)
        const timeDiffMinutes = (commitDate - prCreatedAt) / (1000 * 60)
        return timeDiffMinutes > 5
      })

      console.log(
        `📈 Significant commits after PR: ${significantCommitsAfterPR.length}`
      )

      if (significantCommitsAfterPR.length === 0) {
        const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
        const filteredFiles = this.filterFiles(prFiles || [])
        const sizeDetails = this.calculateSizeDetails(filteredFiles)

        console.log(`✅ No significant commits after PR - 100% maturity`)

        return {
          maturity_ratio: 1.0,
          maturity_percentage: 100,
          details: {
            total_commits: prCommits.length,
            total_changes: sizeDetails.total_changes,
            changes_after_publication: 0,
            stable_changes: sizeDetails.total_changes,
            first_commit_sha: prCommits[0].sha,
            last_commit_sha: prCommits[prCommits.length - 1].sha,
            pr_created_at: prCreatedAt.toISOString(),
            reason: 'No significant commits after PR publication'
          }
        }
      }

      // Calculate maturity based on significant changes
      const firstSignificantCommit = significantCommitsAfterPR[0]
      const lastCommit = prCommits[prCommits.length - 1]

      const firstSignificantIndex = prCommits.findIndex(
        (c) => c.sha === firstSignificantCommit.sha
      )
      const baselineCommit =
        firstSignificantIndex > 0
          ? prCommits[firstSignificantIndex - 1]
          : prCommits[0]

      console.log(`🔍 Using baseline commit: ${baselineCommit.sha}`)
      console.log(`📍 First significant commit: ${firstSignificantCommit.sha}`)

      // Get total PR changes
      const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
      const filteredFiles = this.filterFiles(prFiles || [])
      const totalPRChanges = this.calculateSizeDetails(filteredFiles)

      // Get changes after baseline
      const changesAfterPublicationDiff =
        await this.githubClient.compareCommitsDiff(
          baselineCommit.sha,
          lastCommit.sha
        )

      if (!changesAfterPublicationDiff) {
        console.log('❌ Could not compare commits')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: { error: 'Could not compare commits for maturity analysis' }
        }
      }

      const changesAfterPublication = this.calculateDiffSize(
        changesAfterPublicationDiff.files || []
      )

      // Calculate maturity
      const stableChanges = Math.max(
        0,
        totalPRChanges.total_changes - changesAfterPublication
      )
      const maturityRatio =
        totalPRChanges.total_changes > 0
          ? stableChanges / totalPRChanges.total_changes
          : 1.0
      const maturityPercentage = Math.round(maturityRatio * 100)

      console.log(`📊 Total PR changes: ${totalPRChanges.total_changes}`)
      console.log(
        `📈 Changes after meaningful publication: ${changesAfterPublication}`
      )
      console.log(`🧮 Stable changes: ${stableChanges}`)
      console.log(`📐 Maturity ratio: ${maturityRatio}`)
      console.log(`📊 Maturity percentage: ${maturityPercentage}%`)

      return {
        maturity_ratio: Math.round(maturityRatio * 1000) / 1000,
        maturity_percentage: maturityPercentage,
        details: {
          total_commits: prCommits.length,
          commits_after_publication: significantCommitsAfterPR.length,
          total_changes: totalPRChanges.total_changes,
          changes_after_publication: changesAfterPublication,
          stable_changes: stableChanges,
          first_commit_sha: prCommits[0].sha,
          last_commit_sha: lastCommit.sha,
          baseline_commit_sha: baselineCommit.sha,
          first_significant_commit_sha: firstSignificantCommit.sha,
          pr_created_at: prCreatedAt.toISOString(),
          reason: 'Calculated based on meaningful commits after publication'
        }
      }
    } catch (error) {
      console.error(`💥 Error calculating PR maturity: ${error.message}`)
      return {
        maturity_ratio: null,
        maturity_percentage: null,
        details: { error: error.message }
      }
    }
  }
}

describe('PR Maturity Debug', () => {
  let collector

  beforeEach(() => {
    jest.clearAllMocks()
    collector = new TestDevExMatricsCollector(mockGitHubClient)
  })

  it('should debug maturity calculation - scenario with multiple commits', async () => {
    const prNumber = 123

    // Mock PR details with creation time
    const prCreatedAt = new Date('2024-01-01T10:00:00Z')
    mockGitHubClient.getPullRequest.mockResolvedValue({
      number: prNumber,
      created_at: prCreatedAt.toISOString()
    })

    // Mock PR commits - simulating a PR with 3 commits (one significant commit after PR)
    const mockCommits = [
      {
        sha: 'commit1-sha',
        commit: {
          message: 'Initial commit',
          author: { date: new Date('2024-01-01T09:58:00Z').toISOString() }
        }
      },
      {
        sha: 'commit2-sha',
        commit: {
          message: 'Add feature',
          author: { date: new Date('2024-01-01T10:02:00Z').toISOString() }
        }
      },
      {
        sha: 'commit3-sha',
        commit: {
          message: 'Fix tests',
          author: { date: new Date('2024-01-01T10:15:00Z').toISOString() }
        }
      }
    ]
    mockGitHubClient.getPullRequestCommits.mockResolvedValue(mockCommits)

    // Mock PR files (total PR changes)
    const mockPRFiles = [
      { filename: 'src/file1.js', additions: 50, deletions: 10 },
      { filename: 'src/file2.js', additions: 30, deletions: 5 },
      { filename: 'test/file1.test.js', additions: 20, deletions: 0 }
    ]
    mockGitHubClient.getPullRequestFiles.mockResolvedValue(mockPRFiles)
    // Total PR changes: 50+10+30+5+20+0 = 115

    // Mock commit comparison (changes between commit2 and commit3)
    // Only commit3 is significant (after grace period), so we compare commit2 to commit3
    const mockCommitDiff = {
      files: [{ filename: 'test/file1.test.js', additions: 20, deletions: 0 }]
    }
    mockGitHubClient.compareCommitsDiff.mockResolvedValue(mockCommitDiff)
    // Changes after meaningful publication: 20+0 = 20

    const result = await collector.calculatePRMaturity(prNumber)

    console.log('Final result:', JSON.stringify(result, null, 2))

    // Expected calculation with time-based logic:
    // Total PR changes: 115
    // Changes after meaningful publication: 20 (only commit3's changes)
    // Stable changes: 115 - 20 = 95
    // Maturity ratio: 95/115 = 0.826
    // Maturity percentage: 83%

    expect(result.details.total_changes).toBe(115)
    expect(result.details.changes_after_publication).toBe(20)
    expect(result.details.stable_changes).toBe(95)
    expect(result.maturity_percentage).toBe(83)
    expect(result.details.commits_after_publication).toBe(1)
    expect(result.details.reason).toBe(
      'Calculated based on meaningful commits after publication'
    )
  })

  it('should debug zero maturity issue - all commits within grace period', async () => {
    const prNumber = 789

    // Mock PR details with creation time
    const prCreatedAt = new Date('2024-01-01T10:00:00Z')
    mockGitHubClient.getPullRequest.mockResolvedValue({
      number: prNumber,
      created_at: prCreatedAt.toISOString()
    })

    // Mock commits - all within grace period
    const mockCommits = [
      {
        sha: 'commit1-sha',
        commit: {
          message: 'Initial commit',
          author: { date: new Date('2024-01-01T09:58:00Z').toISOString() }
        }
      },
      {
        sha: 'commit2-sha',
        commit: {
          message: 'Second commit',
          author: { date: new Date('2024-01-01T10:02:00Z').toISOString() }
        }
      }
    ]
    mockGitHubClient.getPullRequestCommits.mockResolvedValue(mockCommits)

    // Mock PR files
    const mockPRFiles = [
      { filename: 'src/main.js', additions: 100, deletions: 50 },
      { filename: 'test/main.test.js', additions: 30, deletions: 0 }
    ]
    mockGitHubClient.getPullRequestFiles.mockResolvedValue(mockPRFiles)
    // Total: 100+50+30+0 = 180

    const result = await collector.calculatePRMaturity(prNumber)

    console.log(
      'All commits within grace period result:',
      JSON.stringify(result, null, 2)
    )

    // Should return 100% maturity since all commits are within grace period
    expect(result.maturity_ratio).toBe(1.0)
    expect(result.maturity_percentage).toBe(100)
    expect(result.details.total_changes).toBe(180)
    expect(result.details.changes_after_publication).toBe(0)
    expect(result.details.stable_changes).toBe(180)
    expect(result.details.reason).toBe(
      'All commits within grace period or pre-existing'
    )
  })

  it('should handle single commit PR - 100% maturity', async () => {
    const prNumber = 456

    // Mock PR details
    const prCreatedAt = new Date('2024-01-01T10:00:00Z')
    mockGitHubClient.getPullRequest.mockResolvedValue({
      number: prNumber,
      created_at: prCreatedAt.toISOString()
    })

    // Mock single commit
    const mockCommits = [
      {
        sha: 'single-commit-sha',
        commit: {
          message: 'Single commit PR',
          author: { date: new Date('2024-01-01T09:55:00Z').toISOString() }
        }
      }
    ]
    mockGitHubClient.getPullRequestCommits.mockResolvedValue(mockCommits)

    // Mock PR files
    const mockPRFiles = [
      { filename: 'src/feature.js', additions: 75, deletions: 25 }
    ]
    mockGitHubClient.getPullRequestFiles.mockResolvedValue(mockPRFiles)

    const result = await collector.calculatePRMaturity(prNumber)

    console.log('Single commit result:', JSON.stringify(result, null, 2))

    expect(result.maturity_ratio).toBe(1.0)
    expect(result.maturity_percentage).toBe(100)
    expect(result.details.total_commits).toBe(1)
    expect(result.details.total_changes).toBe(100)
    expect(result.details.changes_after_publication).toBe(0)
    expect(result.details.stable_changes).toBe(100)
    expect(result.details.reason).toBe('Single commit PR')
  })

  it('should handle PR with pre-existing commits only', async () => {
    const prNumber = 999

    // Mock PR details
    const prCreatedAt = new Date('2024-01-01T10:00:00Z')
    mockGitHubClient.getPullRequest.mockResolvedValue({
      number: prNumber,
      created_at: prCreatedAt.toISOString()
    })

    // Mock commits - all before PR creation
    const mockCommits = [
      {
        sha: 'old-commit1-sha',
        commit: {
          message: 'Old commit 1',
          author: { date: new Date('2024-01-01T09:30:00Z').toISOString() }
        }
      },
      {
        sha: 'old-commit2-sha',
        commit: {
          message: 'Old commit 2',
          author: { date: new Date('2024-01-01T09:45:00Z').toISOString() }
        }
      }
    ]
    mockGitHubClient.getPullRequestCommits.mockResolvedValue(mockCommits)

    // Mock PR files
    const mockPRFiles = [
      { filename: 'src/legacy.js', additions: 60, deletions: 15 }
    ]
    mockGitHubClient.getPullRequestFiles.mockResolvedValue(mockPRFiles)

    const result = await collector.calculatePRMaturity(prNumber)

    console.log('Pre-existing commits result:', JSON.stringify(result, null, 2))

    expect(result.maturity_ratio).toBe(1.0)
    expect(result.maturity_percentage).toBe(100)
    expect(result.details.total_changes).toBe(75)
    expect(result.details.changes_after_publication).toBe(0)
    expect(result.details.stable_changes).toBe(75)
    expect(result.details.reason).toBe(
      'All commits within grace period or pre-existing'
    )
  })

  it('should handle mixed timing scenario', async () => {
    const prNumber = 555

    // Mock PR details
    const prCreatedAt = new Date('2024-01-01T10:00:00Z')
    mockGitHubClient.getPullRequest.mockResolvedValue({
      number: prNumber,
      created_at: prCreatedAt.toISOString()
    })

    // Mock commits with mixed timing
    const mockCommits = [
      {
        sha: 'commit1-sha',
        commit: {
          message: 'Pre-existing commit',
          author: { date: new Date('2024-01-01T09:50:00Z').toISOString() }
        }
      },
      {
        sha: 'commit2-sha',
        commit: {
          message: 'Grace period commit',
          author: { date: new Date('2024-01-01T10:03:00Z').toISOString() }
        }
      },
      {
        sha: 'commit3-sha',
        commit: {
          message: 'Significant commit 1',
          author: { date: new Date('2024-01-01T10:10:00Z').toISOString() }
        }
      },
      {
        sha: 'commit4-sha',
        commit: {
          message: 'Significant commit 2',
          author: { date: new Date('2024-01-01T10:20:00Z').toISOString() }
        }
      }
    ]
    mockGitHubClient.getPullRequestCommits.mockResolvedValue(mockCommits)

    // Mock PR files
    const mockPRFiles = [
      { filename: 'src/app.js', additions: 40, deletions: 10 },
      { filename: 'src/utils.js', additions: 20, deletions: 5 },
      { filename: 'test/app.test.js', additions: 15, deletions: 0 },
      { filename: 'test/utils.test.js', additions: 10, deletions: 0 }
    ]
    mockGitHubClient.getPullRequestFiles.mockResolvedValue(mockPRFiles)
    // Total: 40+10+20+5+15+0+10+0 = 100

    // Mock commit comparison from commit2 (baseline) to commit4 (last)
    const mockCommitDiff = {
      files: [
        { filename: 'test/app.test.js', additions: 15, deletions: 0 },
        { filename: 'test/utils.test.js', additions: 10, deletions: 0 }
      ]
    }
    mockGitHubClient.compareCommitsDiff.mockResolvedValue(mockCommitDiff)
    // Changes after meaningful publication: 15+0+10+0 = 25

    const result = await collector.calculatePRMaturity(prNumber)

    console.log('Mixed timing result:', JSON.stringify(result, null, 2))

    // Expected:
    // Total PR changes: 100
    // Changes after meaningful publication: 25
    // Stable changes: 100 - 25 = 75
    // Maturity: 75/100 = 75%

    expect(result.details.total_changes).toBe(100)
    expect(result.details.changes_after_publication).toBe(25)
    expect(result.details.stable_changes).toBe(75)
    expect(result.maturity_percentage).toBe(75)
    expect(result.details.commits_after_publication).toBe(2)
    expect(result.details.reason).toBe(
      'Calculated based on meaningful commits after publication'
    )
  })
})
