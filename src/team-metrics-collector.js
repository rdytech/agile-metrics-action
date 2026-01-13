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
   * Calculate cycle time for releases created in the time period
   * For each release in the period, includes ALL commits in that release
   * regardless of when they were created
   * @param {Object} dateRange - Date range object with start and end
   * @returns {Promise<Object>} Cycle time metrics
   */
  async calculateCycleTime(dateRange) {
    try {
      // Get releases created within the date range
      const releases = await this.githubClient.getReleasesByDateRange(
        dateRange.start,
        dateRange.end
      )

      if (releases.length === 0) {
        return {
          cycle_time: {
            avg_hours: null,
            commit_count: 0,
            oldest_hours: null,
            newest_hours: null
          }
        }
      }

      const allCycleTimes = []
      let totalCommitCount = 0
      let oldestCycleTime = null
      let newestCycleTime = null

      // Get all releases for comparison (to find previous release)
      const allReleases = await this.githubClient.listReleases(100)

      // For each release in the date range, calculate cycle times for ALL its commits
      for (const release of releases) {
        const releaseCreatedAt = new Date(release.created_at)

        // Resolve the release tag to get SHA
        const tagData = await this.githubClient.resolveTag(release.tag_name)
        if (!tagData?.sha) continue

        // Find the previous release to determine which commits belong to this release
        const releaseIndex = allReleases.findIndex(
          (r) => r.tag_name === release.tag_name
        )
        const previousRelease =
          releaseIndex >= 0 && releaseIndex < allReleases.length - 1
            ? allReleases[releaseIndex + 1]
            : null

        let commits = []
        if (previousRelease) {
          const prevTagData = await this.githubClient.resolveTag(
            previousRelease.tag_name
          )
          if (prevTagData?.sha) {
            core.info(
              `Comparing commits between ${previousRelease.tag_name} and ${release.tag_name}`
            )
            const comparison = await this.githubClient.compareCommits(
              prevTagData.sha,
              tagData.sha
            )
            commits = comparison.commits || []
            core.info(
              `Found ${commits.length} commits in release ${release.tag_name}`
            )
          } else {
            core.warning(
              `Failed to resolve previous release tag: ${previousRelease.tag_name}`
            )
          }
        } else {
          // First release - get all commits up to this tag
          core.info(
            `First release detected: ${release.tag_name}, getting all commits`
          )
          // For the first release, we should get ALL commits in the repository up to this tag
          // not just the tag commit itself
          try {
            // Get commits from the beginning of the repo to this tag
            const commitsResponse = await this.githubClient.octokit.request(
              'GET /repos/{owner}/{repo}/commits',
              {
                owner: this.githubClient.owner,
                repo: this.githubClient.repo,
                sha: tagData.sha,
                per_page: 100
              }
            )
            commits = commitsResponse.data || []
            core.info(`Found ${commits.length} commits in first release`)
          } catch (error) {
            core.warning(
              `Failed to get commits for first release: ${error.message}`
            )
            // Fallback to just the tag commit
            const commit = await this.githubClient.getCommit(tagData.sha)
            if (commit) commits = [commit]
          }
        }

        // Calculate cycle time for ALL commits in this release
        // (not filtered by date - we want all commits that were released in this period)
        for (const commit of commits) {
          const commitDate =
            commit.commit?.committer?.date || commit.commit?.author?.date
          if (!commitDate) continue

          const commitTime = new Date(commitDate)
          const cycleTimeHours =
            (releaseCreatedAt - commitTime) / (1000 * 60 * 60)

          if (cycleTimeHours >= 0) {
            allCycleTimes.push(cycleTimeHours)
            totalCommitCount++

            // Track oldest and newest cycle times
            if (oldestCycleTime === null || cycleTimeHours > oldestCycleTime) {
              oldestCycleTime = cycleTimeHours
            }
            if (newestCycleTime === null || cycleTimeHours < newestCycleTime) {
              newestCycleTime = cycleTimeHours
            }
          }
        }
      }

      // Calculate average and round values
      const avgCycleTime =
        allCycleTimes.length > 0
          ? Math.round(
              (allCycleTimes.reduce((a, b) => a + b, 0) /
                allCycleTimes.length) *
                100
            ) / 100
          : null

      return {
        cycle_time: {
          avg_hours: avgCycleTime,
          commit_count: totalCommitCount,
          oldest_hours:
            oldestCycleTime !== null
              ? Math.round(oldestCycleTime * 100) / 100
              : null,
          newest_hours:
            newestCycleTime !== null
              ? Math.round(newestCycleTime * 100) / 100
              : null
        }
      }
    } catch (error) {
      core.warning(`Failed to calculate cycle time: ${error.message}`)
      return {
        cycle_time: {
          avg_hours: null,
          commit_count: 0,
          oldest_hours: null,
          newest_hours: null
        }
      }
    }
  }

  /**
   * Calculate deploy frequency for the time period
   * @param {Object} dateRange - Date range object with start and end
   * @returns {Promise<Object>} Deploy frequency metrics
   */
  async calculateDeployFrequency(dateRange) {
    try {
      // Get releases within the date range
      const releases = await this.githubClient.getReleasesByDateRange(
        dateRange.start,
        dateRange.end
      )

      const releaseCount = releases.length
      const daysInPeriod = this.getDaysInPeriod()
      const weeksInPeriod = daysInPeriod / 7

      // Calculate releases per week
      const releasesPerWeek =
        weeksInPeriod > 0
          ? Math.round((releaseCount / weeksInPeriod) * 100) / 100
          : null

      return {
        deploy_frequency_days: releasesPerWeek,
        deploy_count: releaseCount
      }
    } catch (error) {
      core.warning(`Failed to calculate deploy frequency: ${error.message}`)
      return {
        deploy_frequency_days: null,
        deploy_count: 0
      }
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

      // Calculate DORA metrics for the time period
      core.info('Calculating DORA metrics (cycle time and deploy frequency)...')
      const [cycleTimeMetrics, deployFreqMetrics] = await Promise.all([
        this.calculateCycleTime(dateRange),
        this.calculateDeployFrequency(dateRange)
      ])

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
        dora_metrics: {
          cycle_time: cycleTimeMetrics.cycle_time,
          ...deployFreqMetrics
        },
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
    // Find first review comment (exclude bot activity)
    const firstReviewComment = timeline?.find(
      (event) =>
        (event.event === 'reviewed' ||
          event.event === 'commented' ||
          event.event === 'line-commented') &&
        event.user?.type !== 'Bot'
    )

    // Find first review from a human (sorted by submission time to ensure chronological order)
    const sortedReviews = reviews
      ?.filter((r) => r.submitted_at && r.user?.type !== 'Bot') // Exclude bot reviews
      .sort(
        (a, b) =>
          new Date(a.submitted_at).getTime() -
          new Date(b.submitted_at).getTime()
      )
    const firstReview = sortedReviews?.[0]

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
    const hours = diffMs / (1000 * 60 * 60)

    // Return null if negative (shouldn't happen but safety check)
    if (hours < 0) {
      return null
    }

    return Math.round(hours * 100) / 100 // Round to 2 decimals
  }

  /**
   * Calculate approve time - time from first comment to first approval
   * @param {Date} createdAt - PR creation time
   * @param {Array} timeline - PR timeline events
   * @param {Array} reviews - PR reviews
   * @returns {number|null} Approve time in hours
   */
  calculateApproveTime(createdAt, timeline, reviews) {
    // Find first approval
    const firstApproval = reviews?.find((review) => review.state === 'APPROVED')

    if (!firstApproval) {
      return null
    }

    // Find first review activity (excluding the approval itself)
    const firstComment = timeline?.find(
      (event) =>
        (event.event === 'reviewed' ||
          event.event === 'commented' ||
          event.event === 'line-commented') &&
        new Date(event.created_at) < new Date(firstApproval.submitted_at)
    )

    // Calculate time from first comment to approval, or from PR creation if no prior comments
    const startTime = firstComment
      ? new Date(firstComment.created_at)
      : createdAt
    const approvalTime = new Date(firstApproval.submitted_at)

    const diffMs = approvalTime - startTime
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
      if (size && Object.prototype.hasOwnProperty.call(sizes, size)) {
        sizes[size]++
      } else {
        sizes.unknown++
      }
    })

    // Calculate predominant size and rating
    let predominantSize = 'unknown'
    let maxCount = 0
    Object.entries(sizes).forEach(([size, count]) => {
      if (size !== 'unknown' && count > maxCount) {
        maxCount = count
        predominantSize = size
      }
    })

    const predominantRating = this.ratePRSize(predominantSize)
    const predominantPercent =
      total > 0 ? Math.round((maxCount / total) * 100) : 0

    return {
      small_percent: total > 0 ? Math.round((sizes.s / total) * 100) : 0,
      medium_percent: total > 0 ? Math.round((sizes.m / total) * 100) : 0,
      large_percent: total > 0 ? Math.round((sizes.l / total) * 100) : 0,
      xl_percent: total > 0 ? Math.round((sizes.xl / total) * 100) : 0,
      unknown_percent:
        total > 0 ? Math.round((sizes.unknown / total) * 100) : 0,
      predominant_size: predominantSize,
      predominant_rating: predominantRating,
      predominant_percent: predominantPercent
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
   * Rate deploy frequency
   * @param {number} frequency - Deploy frequency (days between deployments)
   * @returns {string} Rating
   */
  rateDeployFrequency(frequency) {
    if (frequency > 0.9) return 'Elite'
    if (frequency >= 0.5) return 'Good'
    if (frequency >= 0.2) return 'Fair'
    return 'Needs Focus'
  }

  /**
   * Rate cycle time
   * @param {number} hours - Cycle time in hours
   * @returns {string} Rating
   */
  rateCycleTime(hours) {
    if (hours < 45) return 'Elite'
    if (hours <= 95) return 'Good'
    if (hours <= 169) return 'Fair'
    return 'Needs Focus'
  }

  /**
   * Rate PR size
   * @param {string} size - PR size (s, m, l, xl)
   * @returns {string} Rating
   */
  ratePRSize(size) {
    const sizeMap = {
      s: 'Elite',
      m: 'Good',
      l: 'Fair',
      xl: 'Needs Focus'
    }
    return sizeMap[size] || 'Unknown'
  }

  /**
   * Rate PR maturity
   * @param {number} percentage - Maturity percentage (0-100)
   * @returns {string} Rating
   */
  ratePRMaturity(percentage) {
    if (percentage === null || percentage === undefined) return 'Unknown'
    if (percentage > 88) return 'Elite'
    if (percentage >= 81) return 'Good'
    if (percentage >= 75) return 'Fair'
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
      return `# 📊 Engineering Metrics Report

| **Period** | ${metricsData.period} |
| ---------- | --------------------- |

⚠️ **Error:** ${metricsData.error}
`
    }

    const { metrics, period, date_range, total_prs, unique_authors } =
      metricsData

    const startDate = date_range.start.split('T')[0]
    const endDate = date_range.end.split('T')[0]

    let report = `# 📊 Engineering Metrics Report

> **Period:** ${period.charAt(0).toUpperCase() + period.slice(1)}
> **Date range:** ${startDate} → ${endDate}
> **Total PRs:** ${total_prs} &nbsp;|&nbsp; **Unique authors:** ${unique_authors}

---

`

    // Add Delivery Metrics (DORA metrics) if available
    if (metricsData.dora_metrics) {
      const doraMetrics = metricsData.dora_metrics
      const hasCycleTime =
        doraMetrics.cycle_time?.avg_hours !== undefined &&
        doraMetrics.cycle_time?.avg_hours !== null
      const hasDeployFreq =
        doraMetrics.deploy_frequency_days !== undefined &&
        doraMetrics.deploy_frequency_days !== null

      if (hasCycleTime || hasDeployFreq) {
        report += `## 🚀 Delivery Metrics\n\n`

        if (hasCycleTime) {
          const cycleTimeRating = this.rateCycleTime(
            doraMetrics.cycle_time.avg_hours
          )
          const cycleTimeEmoji = this.getRatingEmoji(cycleTimeRating)
          const oldestHours = doraMetrics.cycle_time.oldest_hours
          const newestHours = doraMetrics.cycle_time.newest_hours

          report += `### ${cycleTimeEmoji} Cycle Time — **${doraMetrics.cycle_time.avg_hours}h** (*${cycleTimeRating}*)\n`
          report += `**Definition:** Time from code commit to release<br>\n`
          report += `**Sample size:** ${doraMetrics.cycle_time.commit_count || 0} commits\n`

          // Add oldest and newest commit details if available
          if (oldestHours !== null && newestHours !== null) {
            const oldestDays = Math.floor(oldestHours / 24)
            const newestDays = Math.floor(newestHours / 24)
            report += `<br>\n`
            report += `📅 **Oldest commit:** ${oldestHours}h (${oldestDays} days)<br>\n`
            report += `📅 **Newest commit:** ${newestHours}h (${newestDays} days)\n`
          }

          report += `\n`
        }

        if (hasDeployFreq) {
          const deployFreqRating = this.rateDeployFrequency(
            doraMetrics.deploy_frequency_days
          )
          const deployFreqEmoji = this.getRatingEmoji(deployFreqRating)
          report += `### ${deployFreqEmoji} Deploy Frequency — **${doraMetrics.deploy_frequency_days}** (*${deployFreqRating}*)\n**Definition:** Number of releases in the period (normalized to per week)<br>\n**Sample size:** ${doraMetrics.deploy_count || 0} releases\n\n`
        }

        report += `---\n\n`
      }
    }

    report += `## 📊 Review Time Metrics\n\n`

    // Pickup Time
    if (metrics.pickup_time.average_hours !== null) {
      const emoji = this.getRatingEmoji(metrics.pickup_time.rating)
      report += `### ${emoji} Pickup Time — **${metrics.pickup_time.average_hours}h** (*${metrics.pickup_time.rating}*)\n**Definition:** Time from PR creation to first review activity<br>\n**Sample size:** ${metrics.pickup_time.sample_size} PRs\n\n`
    }

    // Approve Time
    if (metrics.approve_time.average_hours !== null) {
      const emoji = this.getRatingEmoji(metrics.approve_time.rating)
      report += `### ${emoji} Approve Time — **${metrics.approve_time.average_hours}h** (*${metrics.approve_time.rating}*)\n**Definition:** Time from first review activity (or PR creation) to first approval<br>\n**Sample size:** ${metrics.approve_time.sample_size} PRs\n\n`
    }

    // Merge Time
    if (metrics.merge_time.average_hours !== null) {
      const emoji = this.getRatingEmoji(metrics.merge_time.rating)
      report += `### ${emoji} Merge Time — **${metrics.merge_time.average_hours}h** (*${metrics.merge_time.rating}*)\n**Definition:** Time from first approval to merge<br>\n**Sample size:** ${metrics.merge_time.sample_size} PRs\n\n`
    }

    // Merge Frequency
    const freqEmoji = this.getRatingEmoji(metrics.merge_frequency.rating)
    report += `### ${freqEmoji} Merge Frequency — **${metrics.merge_frequency.value} PRs/dev/week** (*${metrics.merge_frequency.rating}*)\n\n| Metric | Value |\n|---|---:|\n| Merged PRs | ${metrics.merge_frequency.merged_prs} |\n| Total PRs | ${metrics.merge_frequency.total_prs} |\n| Unique authors | ${metrics.merge_frequency.unique_authors} |\n\n---

## 📏 PR Size Distribution

`

    const dist = metrics.size_distribution
    const predominantEmoji = this.getRatingEmoji(dist.predominant_rating)
    report += `| Size | Percentage | Rating |
| ---- | ---------- | ------ |
| **Small (S)** | ${dist.small_percent}% | ⭐ Elite |
| **Medium (M)** | ${dist.medium_percent}% | ✅ Good |
| **Large (L)** | ${dist.large_percent}% | ⚖️ Fair |
| **Extra Large (XL)** | ${dist.xl_percent}% | 🎯 Needs Focus |
${dist.unknown_percent > 0 ? `| **Unknown** | ${dist.unknown_percent}% | ❓ Unknown |\n` : ''}

**Predominant Size:** ${predominantEmoji} ${dist.predominant_size.toUpperCase()} (${dist.predominant_percent}%) - ${dist.predominant_rating}

---

*Report generated on ${new Date(metricsData.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}*
`

    return report
  }
}
