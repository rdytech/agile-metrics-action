import * as core from '@actions/core'
import * as github from '@actions/github'
import { GitHubClient } from './github-client.js'

/**
 * DevEx metrics collection class - independent from DORA metrics
 */
export class DevExMetricsCollector {
  /**
   * Create a new DevEx metrics collector
   * @param {GitHubClient} githubClient - GitHub API client
   * @param {Object} options - Configuration options
   */
  constructor(githubClient, options = {}) {
    this.githubClient = githubClient
    this.options = {
      filesToIgnore: [],
      ignoreLineDeletions: false,
      ignoreFileDeletions: false,
      enabledMetrics: {
        prSize: true,
        prMaturity: true
      },
      ...options
    }
  }

  /**
   * Collect all DevEx metrics for the current PR
   * @returns {Promise<Object>} Complete DevEx metrics data
   */
  async collectMetrics() {
    try {
      const prNumber = this.getPRNumber()
      if (!prNumber) {
        return {
          error: 'No PR context found - DevEx metrics require a pull request'
        }
      }

      core.info(`Collecting DevEx metrics for PR #${prNumber}`)

      const metricsData = {}

      // Collect PR size metrics if enabled
      if (this.options.enabledMetrics.prSize) {
        const prSizeMetrics = await this.calculatePRSize(prNumber)
        metricsData.pr_size = prSizeMetrics
      }

      // Collect PR maturity metrics if enabled
      if (this.options.enabledMetrics.prMaturity) {
        const prMaturityMetrics = await this.calculatePRMaturity(prNumber)
        metricsData.pr_maturity = prMaturityMetrics
      }

      return {
        pr_number: prNumber,
        metrics: metricsData,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      core.error(`DevEx metrics collection failed: ${error.message}`)
      return {
        error: error.message
      }
    }
  }

  /**
   * Get the current PR number from GitHub context
   * @returns {number|null} PR number or null if not in PR context
   */
  getPRNumber() {
    // Check if we're in a pull request event
    if (
      github.context.eventName === 'pull_request' ||
      github.context.eventName === 'pull_request_target'
    ) {
      return github.context.payload.pull_request?.number
    }

    // Check if we're in a workflow_run event triggered by a PR
    if (github.context.eventName === 'workflow_run') {
      return github.context.payload.workflow_run?.pull_requests?.[0]?.number
    }

    return null
  }

  /**
   * Calculate PR size metrics
   * @param {number} prNumber - Pull request number
   * @returns {Promise<Object>} PR size metrics
   */
  async calculatePRSize(prNumber) {
    try {
      const prDetails = await this.githubClient.getPullRequest(prNumber)

      // Skip calculation for draft PRs
      if (prDetails?.draft) {
        core.info('PR is a draft - skipping size calculation')
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
        return {
          size: 'xs',
          category: 'size/xs',
          details: {
            total_additions: 0,
            total_deletions: 0,
            total_changes: 0,
            files_changed: 0,
            files_analyzed: 0
          }
        }
      }

      // Filter files based on ignore patterns
      const filteredFiles = this.filterFiles(prFiles)

      // Calculate size metrics
      const sizeDetails = this.calculateSizeDetails(filteredFiles)
      const sizeCategory = this.categorizePRSize(sizeDetails)

      return {
        size: sizeCategory,
        category: `size/${sizeCategory}`,
        details: sizeDetails
      }
    } catch (error) {
      core.warning(`Failed to calculate PR size: ${error.message}`)
      return {
        size: 'unknown',
        category: 'size/unknown',
        details: {
          error: error.message
        }
      }
    }
  }

  /**
   * Filter files based on ignore patterns
   * @param {Array} files - Array of PR file objects
   * @returns {Array} Filtered files
   */
  filterFiles(files) {
    if (!this.options.filesToIgnore.length) {
      return files
    }

    return files.filter((file) => {
      // Check if file matches any ignore pattern
      const shouldIgnore = this.options.filesToIgnore.some((pattern) => {
        // Convert glob pattern to regex (basic implementation)
        const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
        const regex = new RegExp(`^${regexPattern}$`)
        return regex.test(file.filename)
      })

      if (shouldIgnore) {
        core.debug(`Ignoring file: ${file.filename}`)
        return false
      }

      // Check if we should ignore deleted files
      if (this.options.ignoreFileDeletions && file.status === 'removed') {
        core.debug(`Ignoring deleted file: ${file.filename}`)
        return false
      }

      return true
    })
  }

  /**
   * Calculate detailed size metrics from filtered files
   * @param {Array} files - Filtered PR files
   * @returns {Object} Size details
   */
  calculateSizeDetails(files) {
    let totalAdditions = 0
    let totalDeletions = 0
    let filesChanged = files.length

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

  /**
   * Categorize PR size based on change metrics
   * @param {Object} sizeDetails - Size details object
   * @returns {string} Size category (s, m, l, xl)
   */
  categorizePRSize(sizeDetails) {
    const { total_changes } = sizeDetails

    // Define size thresholds based on common PR size conventions
    if (total_changes < 105) return 's'
    if (total_changes <= 160) return 'm'
    if (total_changes <= 240) return 'l'
    return 'xl'
  }

  /**
   * Calculate PR maturity metrics
   * @param {number} prNumber - Pull request number
   * @returns {Promise<Object>} PR maturity metrics
   */
  async calculatePRMaturity(prNumber) {
    try {
      core.debug(`=== Calculating PR Maturity for PR #${prNumber} ===`)

      const prDetails = await this.githubClient.getPullRequest(prNumber)
      if (!prDetails) {
        core.warning('Could not fetch PR details for maturity calculation')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: {
            error: 'Could not fetch PR details'
          }
        }
      }

      // Skip calculation for draft PRs
      if (prDetails.draft) {
        core.info('PR is a draft - skipping maturity calculation')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: {
            reason: 'PR is in draft status'
          }
        }
      }

      const [prCommits, timeline] = await Promise.all([
        this.githubClient.getPullRequestCommits(prNumber),
        this.githubClient.getPullRequestTimeline(prNumber)
      ])
      core.debug(`Found ${prCommits?.length || 0} commits in PR #${prNumber}`)

      if (!prCommits || prCommits.length === 0) {
        core.warning('No commits found in PR for maturity calculation')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: {
            error: 'No commits found in PR'
          }
        }
      }

      // Determine the reference time: when the PR became ready for review.
      // For PRs that started as drafts this is the `ready_for_review` timeline
      // event; for all other PRs it is the PR creation time.
      const prCreatedAt = new Date(prDetails.created_at)
      const readyForReviewEvent = timeline?.find(
        (event) => event.event === 'ready_for_review'
      )
      const readyForReviewAt = readyForReviewEvent
        ? new Date(readyForReviewEvent.created_at)
        : prCreatedAt

      core.debug(`PR created at: ${prCreatedAt.toISOString()}`)
      core.debug(`PR ready for review at: ${readyForReviewAt.toISOString()}`)

      // If there's only one commit return 100% maturity unconditionally – there
      // can be no post-publication churn in a single-commit PR.
      if (prCommits.length === 1) {
        const commitDate = new Date(prCommits[0].commit.author.date)
        const timeDiffMinutes = (commitDate - readyForReviewAt) / (1000 * 60)

        core.debug(
          `Single commit time difference: ${timeDiffMinutes.toFixed(2)} minutes from ready-for-review`
        )

        const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
        const filteredFiles = this.filterFiles(prFiles || [])
        const sizeDetails = this.calculateSizeDetails(filteredFiles)

        core.debug(
          `Single commit PR - 100% maturity with ${sizeDetails.total_changes} total changes`
        )

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
            ready_for_review_at: readyForReviewAt.toISOString(),
            reason: 'Single commit PR'
          }
        }
      }

      // Check if all commits are older than ready-for-review time (or within 5 minutes)
      const commitsWithinGracePeriod = prCommits.filter((commit) => {
        const commitDate = new Date(commit.commit.author.date)
        const timeDiffMinutes =
          Math.abs(commitDate - readyForReviewAt) / (1000 * 60)
        return timeDiffMinutes <= 5 || commitDate <= readyForReviewAt
      })

      if (commitsWithinGracePeriod.length === prCommits.length) {
        core.debug(
          'All commits are within 5 minutes of ready-for-review time or older - 100% maturity'
        )

        const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
        const filteredFiles = this.filterFiles(prFiles || [])
        const sizeDetails = this.calculateSizeDetails(filteredFiles)

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
            ready_for_review_at: readyForReviewAt.toISOString(),
            reason: 'All commits within grace period or pre-existing'
          }
        }
      }

      // Find commits that are meaningfully after ready-for-review time (>5 minutes)
      const significantCommitsAfterPR = prCommits.filter((commit) => {
        const commitDate = new Date(commit.commit.author.date)
        const timeDiffMinutes = (commitDate - readyForReviewAt) / (1000 * 60)
        return timeDiffMinutes > 5
      })

      if (significantCommitsAfterPR.length === 0) {
        core.debug(
          'No significant commits after ready-for-review time - 100% maturity'
        )

        const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
        const filteredFiles = this.filterFiles(prFiles || [])
        const sizeDetails = this.calculateSizeDetails(filteredFiles)

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
            ready_for_review_at: readyForReviewAt.toISOString(),
            reason: 'No significant commits after PR publication'
          }
        }
      }

      // Calculate maturity based on changes introduced after the grace period
      const firstSignificantCommit = significantCommitsAfterPR[0]
      const lastCommit = prCommits[prCommits.length - 1]

      core.debug(
        `Analyzing changes from first significant commit: ${firstSignificantCommit.sha}`
      )

      // Get total PR changes
      const prFiles = await this.githubClient.getPullRequestFiles(prNumber)
      const filteredFiles = this.filterFiles(prFiles || [])
      const totalPRChanges = this.calculateSizeDetails(filteredFiles)

      core.debug(
        `Total PR changes: ${totalPRChanges.total_changes} (${totalPRChanges.total_additions} additions, ${totalPRChanges.total_deletions} deletions)`
      )

      // Find the commit just before the first significant commit to use as baseline
      const firstSignificantIndex = prCommits.findIndex(
        (c) => c.sha === firstSignificantCommit.sha
      )
      const baselineCommit =
        firstSignificantIndex > 0
          ? prCommits[firstSignificantIndex - 1]
          : prCommits[0]

      core.debug(
        `Using baseline commit: ${baselineCommit.sha} (index: ${firstSignificantIndex > 0 ? firstSignificantIndex - 1 : 0})`
      )

      // Get changes introduced after the baseline (changes after meaningful publication)
      const changesAfterPublicationDiff =
        await this.githubClient.compareCommitsDiff(
          baselineCommit.sha,
          lastCommit.sha
        )

      if (!changesAfterPublicationDiff) {
        core.warning('Could not compare commits for maturity calculation')
        return {
          maturity_ratio: null,
          maturity_percentage: null,
          details: {
            error: 'Could not compare commits for maturity analysis'
          }
        }
      }

      const changesAfterPublication = this.calculateDiffSize(
        changesAfterPublicationDiff.files || []
      )

      core.debug(
        `Changes after meaningful publication: ${changesAfterPublication}`
      )

      // Calculate maturity ratio
      const stableChanges = Math.max(
        0,
        totalPRChanges.total_changes - changesAfterPublication
      )
      const maturityRatio =
        totalPRChanges.total_changes > 0
          ? stableChanges / totalPRChanges.total_changes
          : 1.0
      const maturityPercentage = Math.round(maturityRatio * 100)

      core.debug(
        `Maturity calculation: stable=${stableChanges}, ratio=${maturityRatio}, percentage=${maturityPercentage}%`
      )

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
          ready_for_review_at: readyForReviewAt.toISOString(),
          reason: 'Calculated based on meaningful commits after publication'
        }
      }
    } catch (error) {
      core.warning(`Failed to calculate PR maturity: ${error.message}`)
      return {
        maturity_ratio: null,
        maturity_percentage: null,
        details: {
          error: error.message
        }
      }
    }
  }

  /**
   * Calculate the size of changes in a diff
   * @param {Array} files - Array of file diff objects
   * @returns {number} Total number of changes
   */
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

  /**
   * Add PR comment with size and maturity information
   * @param {number} prNumber - Pull request number
   * @param {Object} prSizeMetrics - PR size metrics
   * @param {Object} prMaturityMetrics - PR maturity metrics (optional)
   * @returns {Promise<void>}
   */
  async addPRComment(prNumber, prSizeMetrics, prMaturityMetrics = null) {
    try {
      // Skip comment if PR is in draft status
      if (prSizeMetrics.category === 'draft') {
        core.info(`PR #${prNumber} is a draft - skipping PR comment`)
        return
      }

      // Delete any previous comments created by this action
      const existingComments =
        await this.githubClient.listIssueComments(prNumber)
      const previousActionComments = existingComments.filter((c) =>
        c.body?.includes(
          '*This comment was generated automatically by the Agile Metrics Action.*'
        )
      )
      for (const comment of previousActionComments) {
        await this.githubClient.deleteIssueComment(comment.id)
        core.info(
          `Deleted previous action comment ${comment.id} on PR #${prNumber}`
        )
      }

      const { size, details } = prSizeMetrics
      const sizeEmoji = this.getSizeEmoji(size)
      const sizeRating = this.getSizeRating(size)
      const sizeRatingEmoji = this.getRatingEmoji(sizeRating)

      let comment = `## ${sizeEmoji} PR Size: ${size.toUpperCase()} ${sizeRatingEmoji} ${sizeRating}

This pull request has been automatically categorized as **${size}** with a **${sizeRating}** rating based on the following metrics:

- **Lines added:** ${details.total_additions}
- **Lines removed:** ${details.total_deletions}
- **Total changes:** ${details.total_changes}
- **Files changed:** ${details.files_changed}`

      // Add PR maturity information if available
      if (prMaturityMetrics && prMaturityMetrics.maturity_percentage !== null) {
        const maturityEmoji = this.getMaturityEmoji(
          prMaturityMetrics.maturity_percentage
        )
        const maturityLevel = this.getMaturityLevel(
          prMaturityMetrics.maturity_percentage
        )
        const maturityRatingEmoji = this.getRatingEmoji(maturityLevel)

        comment += `

## ${maturityEmoji} PR Maturity: ${prMaturityMetrics.maturity_percentage}% ${maturityRatingEmoji} ${maturityLevel}

This pull request has a **${maturityLevel}** maturity rating based on code stability:

- **Maturity ratio:** ${prMaturityMetrics.maturity_ratio}
- **Total commits:** ${prMaturityMetrics.details?.total_commits || 'N/A'}
- **Stable changes:** ${prMaturityMetrics.details?.stable_changes || 'N/A'}
- **Changes after publication:** ${prMaturityMetrics.details?.changes_after_publication || 'N/A'}`
      }

      comment += `

*This comment was generated automatically by the Agile Metrics Action.*`

      await this.githubClient.createPRComment(prNumber, comment)
      core.info(`Added DevEx comment to PR #${prNumber}`)
    } catch (error) {
      core.warning(`Failed to add PR comment: ${error.message}`)
    }
  }

  /**
   * Add size label to PR
   * @param {number} prNumber - Pull request number
   * @param {string} sizeCategory - Size category (e.g., 'size/m')
   * @returns {Promise<void>}
   */
  async addPRLabel(prNumber, sizeCategory) {
    try {
      await this.githubClient.addPRLabel(prNumber, sizeCategory)
      core.info(`Added label '${sizeCategory}' to PR #${prNumber}`)
    } catch (error) {
      core.warning(`Failed to add PR label: ${error.message}`)
    }
  }

  /**
   * Get emoji for size category
   * @param {string} size - Size category
   * @returns {string} Emoji representation
   */
  getSizeEmoji(size) {
    const emojiMap = {
      s: '🔹',
      m: '🔸',
      l: '🔶',
      xl: '🔥'
    }
    return emojiMap[size] || '❓'
  }

  /**
   * Get size rating based on DevEx categories
   * @param {string} size - Size category (s, m, l, xl)
   * @returns {string} Rating
   */
  getSizeRating(size) {
    const ratingMap = {
      s: 'Elite',
      m: 'Good',
      l: 'Fair',
      xl: 'Needs Focus'
    }
    return ratingMap[size] || 'Unknown'
  }

  /**
   * Get emoji for rating level
   * @param {string} rating - Rating level (Elite, Good, Fair, Needs Focus)
   * @returns {string} Emoji representation
   */
  getRatingEmoji(rating) {
    const emojiMap = {
      Elite: '⭐',
      Good: '✅',
      Fair: '⚖️',
      'Needs Focus': '🎯'
    }
    return emojiMap[rating] || '❓'
  }

  /**
   * Get emoji for PR maturity percentage
   * @param {number} percentage - Maturity percentage (0-100)
   * @returns {string} Emoji representation
   */
  getMaturityEmoji(percentage) {
    if (percentage === null || percentage === undefined) return '❓'
    if (percentage > 88) return '⭐'
    if (percentage >= 81) return '✅'
    if (percentage >= 75) return '⚖️'
    return '🎯'
  }

  /**
   * Get maturity level description
   * @param {number} percentage - Maturity percentage (0-100)
   * @returns {string} Maturity level description
   */
  getMaturityLevel(percentage) {
    if (percentage === null || percentage === undefined) return 'Unknown'
    if (percentage > 88) return 'Elite'
    if (percentage >= 81) return 'Good'
    if (percentage >= 75) return 'Fair'
    return 'Needs Focus'
  }
}
