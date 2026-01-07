import * as core from '@actions/core'

/**
 * Team metrics collection class for analyzing PR metrics across a team
 */
export class TeamMetricsCollector {
  /**
   * Create a new team metrics collector
   * @param {Object} githubClient - GitHub API client
   * @param {Object} options - Configuration options
   */
  constructor(githubClient, options = {}) {
    this.githubClient = githubClient
    this.options = {
      timePeriod: 'weekly', // weekly, fortnightly, monthly
      ...options
    }
  }

  /**
   * Get date range based on time period
   * @returns {Object} Object with start and end dates
   */
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

    return {
      start: start.toISOString(),
      end
    }
  }

  /**
   * Collect team metrics for the specified time period
   * @returns {Promise<Object>} Team metrics data
   */
  async collectMetrics() {
    try {
      core.info(
        `Collecting team metrics for period: ${this.options.timePeriod}`
      )

      const dateRange = this.getDateRange()
      core.info(
        `Date range: ${dateRange.start.split('T')[0]} to ${dateRange.end.split('T')[0]}`
      )

      // Fetch all PRs in the date range
      const prs = await this.githubClient.getPullRequestsByDateRange(
        dateRange.start,
        dateRange.end
      )

      if (!prs || prs.length === 0) {
        return {
          error: 'No pull requests found in the specified time period',
          period: this.options.timePeriod,
          date_range: dateRange
        }
      }

      core.info(`Found ${prs.length} PRs in the time period`)

      // Calculate metrics for each PR
      const prMetrics = []
      for (const pr of prs) {
        const metrics = await this.calculatePRMetrics(pr)
        if (metrics) {
          prMetrics.push(metrics)
        }
      }

      // Calculate aggregate statistics
      const stats = this.calculateAggregateStats(prMetrics)

      return {
        period: this.options.timePeriod,
        date_range: dateRange,
        total_prs: prs.length,
        analyzed_prs: prMetrics.length,
        unique_authors: this.countUniqueAuthors(prs),
        metrics: stats,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      core.error(`Team metrics collection failed: ${error.message}`)
      return {
        error: error.message,
        period: this.options.timePeriod
      }
    }
  }

  /**
   * Calculate metrics for a single PR
   * @param {Object} pr - Pull request object
   * @returns {Promise<Object>} PR metrics
   */
  async calculatePRMetrics(pr) {
    try {
      const prNumber = pr.number
      const createdAt = new Date(pr.created_at)

      // Get PR timeline and reviews
      const [timeline, reviews] = await Promise.all([
        this.githubClient.getPullRequestTimeline(prNumber),
        this.githubClient.getPullRequestReviews(prNumber)
      ])

      // Calculate pickup time (creation to first review comment)
      const pickupTime = this.calculatePickupTime(createdAt, timeline, reviews)

      // Calculate approve time (first comment to first approval)
      const approveTime = this.calculateApproveTime(
        createdAt,
        timeline,
        reviews
      )

      // Calculate merge time (first approval to merge)
      const mergeTime = pr.merged_at
        ? this.calculateMergeTime(pr.merged_at, reviews)
        : null

      // Get PR size from labels
      const prSize = this.getPRSizeFromLabels(pr.labels)

      return {
        pr_number: prNumber,
        author: pr.user.login,
        state: pr.state,
        merged: pr.merged_at !== null,
        created_at: pr.created_at,
        merged_at: pr.merged_at,
        pickup_time_hours: pickupTime,
        approve_time_hours: approveTime,
        merge_time_hours: mergeTime,
        pr_size: prSize
      }
    } catch (error) {
      core.warning(
        `Failed to calculate metrics for PR #${pr.number}: ${error.message}`
      )
      return null
    }
  }

  /**
   * Calculate pickup time - time from PR creation to first review activity
   * @param {Date} createdAt - PR creation time
   * @param {Array} timeline - PR timeline events
   * @param {Array} reviews - PR reviews
   * @returns {number|null} Pickup time in hours
   */
  calculatePickupTime(createdAt, timeline, reviews) {
    // Find first review comment or review
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

    if (!firstActivityTime) {
      return null
    }

    const diffMs = firstActivityTime - createdAt
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100 // Round to 2 decimals
  }

  /**
   * Calculate approve time - time from first comment to first approval
   * @param {Date} createdAt - PR creation time
   * @param {Array} timeline - PR timeline events
   * @param {Array} reviews - PR reviews
   * @returns {number|null} Approve time in hours
   */
  calculateApproveTime(createdAt, timeline, reviews) {
    // Find first review comment
    const firstComment = timeline?.find(
      (event) =>
        event.event === 'reviewed' ||
        event.event === 'commented' ||
        event.event === 'line-commented'
    )

    // Find first approval
    const firstApproval = reviews?.find((review) => review.state === 'APPROVED')

    if (!firstComment || !firstApproval) {
      return null
    }

    const commentTime = new Date(firstComment.created_at)
    const approvalTime = new Date(firstApproval.submitted_at)

    const diffMs = approvalTime - commentTime
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
  }

  /**
   * Calculate merge time - time from first approval to merge
   * @param {string} mergedAt - PR merge time
   * @param {Array} reviews - PR reviews
   * @returns {number|null} Merge time in hours
   */
  calculateMergeTime(mergedAt, reviews) {
    const firstApproval = reviews?.find((review) => review.state === 'APPROVED')

    if (!firstApproval) {
      return null
    }

    const approvalTime = new Date(firstApproval.submitted_at)
    const mergeTime = new Date(mergedAt)

    const diffMs = mergeTime - approvalTime
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
  }

  /**
   * Get PR size from labels
   * @param {Array} labels - PR labels
   * @returns {string|null} PR size (s, m, l, xl)
   */
  getPRSizeFromLabels(labels) {
    if (!labels || labels.length === 0) {
      return null
    }

    const sizeLabel = labels.find((label) =>
      label.name.toLowerCase().startsWith('size/')
    )

    if (!sizeLabel) {
      return null
    }

    // Extract size from label (e.g., "size/m" -> "m")
    return sizeLabel.name.toLowerCase().replace('size/', '')
  }

  /**
   * Count unique authors in the PR list
   * @param {Array} prs - Array of pull requests
   * @returns {number} Number of unique authors
   */
  countUniqueAuthors(prs) {
    const authors = new Set(prs.map((pr) => pr.user.login))
    return authors.size
  }

  /**
   * Calculate aggregate statistics from PR metrics
   * @param {Array} prMetrics - Array of PR metrics
   * @returns {Object} Aggregate statistics
   */
  calculateAggregateStats(prMetrics) {
    // Filter out null values for each metric
    const pickupTimes = prMetrics
      .map((m) => m.pickup_time_hours)
      .filter((t) => t !== null)
    const approveTimes = prMetrics
      .map((m) => m.approve_time_hours)
      .filter((t) => t !== null)
    const mergeTimes = prMetrics
      .map((m) => m.merge_time_hours)
      .filter((t) => t !== null)

    // Calculate averages
    const avgPickupTime =
      pickupTimes.length > 0
        ? pickupTimes.reduce((a, b) => a + b, 0) / pickupTimes.length
        : null
    const avgApproveTime =
      approveTimes.length > 0
        ? approveTimes.reduce((a, b) => a + b, 0) / approveTimes.length
        : null
    const avgMergeTime =
      mergeTimes.length > 0
        ? mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length
        : null

    // Count merged PRs
    const mergedCount = prMetrics.filter((m) => m.merged).length
    const totalPRs = prMetrics.length

    // Calculate merge frequency per developer per week
    const uniqueAuthors = new Set(prMetrics.map((m) => m.author)).size
    const daysInPeriod = this.getDaysInPeriod()
    const weeksInPeriod = daysInPeriod / 7
    const mergeFrequency =
      uniqueAuthors > 0 && weeksInPeriod > 0
        ? mergedCount / (uniqueAuthors * weeksInPeriod)
        : 0

    // Calculate PR size distribution
    const sizeDistribution = this.calculateSizeDistribution(prMetrics)

    return {
      pickup_time: {
        average_hours: avgPickupTime
          ? Math.round(avgPickupTime * 100) / 100
          : null,
        rating: avgPickupTime ? this.ratePickupTime(avgPickupTime) : null,
        sample_size: pickupTimes.length
      },
      approve_time: {
        average_hours: avgApproveTime
          ? Math.round(avgApproveTime * 100) / 100
          : null,
        rating: avgApproveTime ? this.rateApproveTime(avgApproveTime) : null,
        sample_size: approveTimes.length
      },
      merge_time: {
        average_hours: avgMergeTime
          ? Math.round(avgMergeTime * 100) / 100
          : null,
        rating: avgMergeTime ? this.rateMergeTime(avgMergeTime) : null,
        sample_size: mergeTimes.length
      },
      merge_frequency: {
        value: Math.round(mergeFrequency * 100) / 100,
        rating: this.rateMergeFrequency(mergeFrequency),
        merged_prs: mergedCount,
        total_prs: totalPRs,
        unique_authors: uniqueAuthors
      },
      size_distribution: sizeDistribution
    }
  }

  /**
   * Calculate PR size distribution
   * @param {Array} prMetrics - Array of PR metrics
   * @returns {Object} Size distribution percentages
   */
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

  /**
   * Get number of days in the current period
   * @returns {number} Number of days
   */
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

  /**
   * Rate pickup time
   * @param {number} hours - Pickup time in hours
   * @returns {string} Rating
   */
  ratePickupTime(hours) {
    if (hours < 2) return 'Elite'
    if (hours <= 6) return 'Good'
    if (hours <= 16) return 'Fair'
    return 'Needs Focus'
  }

  /**
   * Rate approve time
   * @param {number} hours - Approve time in hours
   * @returns {string} Rating
   */
  rateApproveTime(hours) {
    if (hours < 17) return 'Elite'
    if (hours <= 24) return 'Good'
    if (hours <= 45) return 'Fair'
    return 'Needs Focus'
  }

  /**
   * Rate merge time
   * @param {number} hours - Merge time in hours
   * @returns {string} Rating
   */
  rateMergeTime(hours) {
    if (hours < 2) return 'Elite'
    if (hours <= 5) return 'Good'
    if (hours <= 19) return 'Fair'
    return 'Needs Focus'
  }

  /**
   * Rate merge frequency
   * @param {number} frequency - Merge frequency (PRs per dev per week)
   * @returns {string} Rating
   */
  rateMergeFrequency(frequency) {
    if (frequency > 1.6) return 'Elite'
    if (frequency >= 1.1) return 'Good'
    if (frequency >= 0.6) return 'Fair'
    return 'Needs Focus'
  }

  /**
   * Get emoji for rating
   * @param {string} rating - Rating
   * @returns {string} Emoji
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
   * Generate markdown report
   * @param {Object} metricsData - Team metrics data
   * @returns {string} Markdown report
   */
  generateMarkdownReport(metricsData) {
    if (metricsData.error) {
      return `# Team Metrics Report

**Period:** ${metricsData.period}

⚠️ **Error:** ${metricsData.error}
`
    }

    const { metrics, period, date_range, total_prs, unique_authors } =
      metricsData

    let report = `# Team Metrics Report

**Period:** ${period}
**Date Range:** ${date_range.start.split('T')[0]} to ${date_range.end.split('T')[0]}
**Total PRs:** ${total_prs}
**Unique Authors:** ${unique_authors}

---

## 📊 Time Metrics

`

    // Pickup Time
    if (metrics.pickup_time.average_hours !== null) {
      const emoji = this.getRatingEmoji(metrics.pickup_time.rating)
      report += `### ${emoji} Pickup Time: ${metrics.pickup_time.average_hours}h (${metrics.pickup_time.rating})

Time from PR creation to first review activity.
- **Sample Size:** ${metrics.pickup_time.sample_size} PRs

`
    }

    // Approve Time
    if (metrics.approve_time.average_hours !== null) {
      const emoji = this.getRatingEmoji(metrics.approve_time.rating)
      report += `### ${emoji} Approve Time: ${metrics.approve_time.average_hours}h (${metrics.approve_time.rating})

Time from first comment to first approval.
- **Sample Size:** ${metrics.approve_time.sample_size} PRs

`
    }

    // Merge Time
    if (metrics.merge_time.average_hours !== null) {
      const emoji = this.getRatingEmoji(metrics.merge_time.rating)
      report += `### ${emoji} Merge Time: ${metrics.merge_time.average_hours}h (${metrics.merge_time.rating})

Time from first approval to merge.
- **Sample Size:** ${metrics.merge_time.sample_size} PRs

`
    }

    // Merge Frequency
    const freqEmoji = this.getRatingEmoji(metrics.merge_frequency.rating)
    report += `---

## ${freqEmoji} Merge Frequency: ${metrics.merge_frequency.value} PRs/dev/week (${metrics.merge_frequency.rating})

- **Merged PRs:** ${metrics.merge_frequency.merged_prs}
- **Total PRs:** ${metrics.merge_frequency.total_prs}
- **Unique Authors:** ${metrics.merge_frequency.unique_authors}

---

## 📏 PR Size Distribution

`

    const dist = metrics.size_distribution
    report += `- **Small:** ${dist.small_percent}%
- **Medium:** ${dist.medium_percent}%
- **Large:** ${dist.large_percent}%
- **XL:** ${dist.xl_percent}%
${dist.unknown_percent > 0 ? `- **Unknown:** ${dist.unknown_percent}%\n` : ''}
---

*Report generated on ${new Date(metricsData.timestamp).toLocaleString()}*
`

    return report
  }
}
