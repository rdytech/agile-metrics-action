import * as core from '@actions/core'
import { GitHubClient } from './github-client.js'
import { toISOString, hoursBetween, daysBetween } from './utils.js'

/**
 * Main metrics collection class
 */
export class MetricsCollector {
  /**
   * Create a new metrics collector
   * @param {GitHubClient} githubClient - GitHub API client
   * @param {Object} options - Configuration options
   */
  constructor(githubClient, options = {}) {
    this.githubClient = githubClient
    this.options = {
      includeMergeCommits: false,
      maxReleases: 100,
      maxTags: 100,
      enabledMetrics: {
        deploymentFrequency: true,
        leadTime: true
      },
      ...options
    }
  }

  /**
   * Collect all metrics for the repository
   * @returns {Promise<Object>} Complete metrics data
   */
  async collectMetrics() {
    try {
      // Determine data source (releases vs tags)
      const { source, latest, previous } = await this.determineDataSource()

      if (!latest?.sha || !latest?.created_at) {
        return {
          error: 'Could not resolve latest release/tag SHA or created_at'
        }
      }

      const metricsData = {}

      // Calculate deploy frequency if enabled
      if (this.options.enabledMetrics.deploymentFrequency) {
        const deployFrequencyDays = this.calculateDeployFrequency(
          latest,
          previous
        )
        metricsData.deploy_frequency_days = deployFrequencyDays
      }

      // Calculate cycle time if enabled
      if (this.options.enabledMetrics.leadTime) {
        const cycleTimeMetrics = await this.calculateCycleTime(latest, previous)
        metricsData.cycle_time = cycleTimeMetrics
      }

      // Generate complete metrics object
      const metrics = {
        generated_at: toISOString(new Date()),
        repo: `${this.githubClient.owner}/${this.githubClient.repo}`,
        source,
        latest: {
          name: latest.name || latest.tag || latest?.name,
          tag: latest.tag || latest?.name,
          sha: latest.sha,
          created_at: toISOString(latest.created_at)
        },
        previous: previous
          ? {
              name: previous.name || previous.tag || previous?.name,
              tag: previous.tag || previous?.name,
              sha: previous.sha || null,
              created_at: previous.created_at
                ? toISOString(previous.created_at)
                : null
            }
          : null,
        metrics: metricsData
      }

      return metrics
    } catch (error) {
      core.error(`Failed to collect metrics: ${error.message}`)
      return { error: `Metrics collection failed: ${error.message}` }
    }
  }

  /**
   * Determine whether to use releases or tags and get latest/previous
   * @returns {Promise<Object>} Data source information
   */
  async determineDataSource() {
    // Try releases first
    const releases = await this.githubClient.listReleases(
      this.options.maxReleases
    )

    if (releases.length >= 1) {
      const latest = {
        name: releases[0].name || releases[0].tag_name,
        tag: releases[0].tag_name,
        created_at: releases[0].created_at
      }

      const previous =
        releases.length >= 2
          ? {
              name: releases[1].name || releases[1].tag_name,
              tag: releases[1].tag_name,
              created_at: releases[1].created_at
            }
          : null

      // Resolve SHAs from tags
      const headResolved = await this.githubClient.resolveTag(latest.tag)
      latest.sha = headResolved?.sha

      if (previous) {
        const baseResolved = await this.githubClient.resolveTag(previous.tag)
        previous.sha = baseResolved?.sha
      }

      return { source: 'release', latest, previous }
    }

    // Fallback to tags
    const tags = await this.githubClient.listTags(this.options.maxTags)

    if (tags.length === 0) {
      throw new Error('No releases or tags found')
    }

    const latestTag = await this.githubClient.resolveTag(tags[0].name)
    const prevTag = tags[1]
      ? await this.githubClient.resolveTag(tags[1].name)
      : null

    return { source: 'tag', latest: latestTag, previous: prevTag }
  }

  /**
   * Calculate deploy frequency between releases/tags
   * @param {Object} latest - Latest release/tag
   * @param {Object} previous - Previous release/tag
   * @returns {number|null} Days between deployments
   */
  calculateDeployFrequency(latest, previous) {
    if (!previous?.created_at) {
      return null
    }

    const days = daysBetween(latest.created_at, previous.created_at)
    return Number(days.toFixed(3))
  }

  /**
   * Calculate cycle time metrics
   * @param {Object} latest - Latest release/tag
   * @param {Object} previous - Previous release/tag
   * @returns {Promise<Object>} Cycle time metrics
   */
  async calculateCycleTime(latest, previous) {
    let allCommits = []
    let commitDates = []

    if (previous?.sha) {
      // Compare commits between previous and latest
      const comparison = await this.githubClient.compareCommits(
        previous.sha,
        latest.sha
      )
      allCommits = comparison.commits || []
    } else {
      // Single-tag case: use the single tagged commit
      const commit = await this.githubClient.getCommit(latest.sha)
      if (commit) {
        allCommits = [commit]
      }
    }

    // Extract commit dates
    commitDates = allCommits
      .map((c) => c.commit?.committer?.date || c.commit?.author?.date)
      .filter(Boolean)

    let ltcAvgHours = null
    let ltcOldestHours = null
    let ltcNewestHours = null
    let oldestCommitSha = null
    let newestCommitSha = null

    if (commitDates.length > 0) {
      const commitsWithAges = allCommits
        .map((c) => ({
          sha: c.sha,
          date: c.commit?.committer?.date || c.commit?.author?.date,
          age: hoursBetween(
            latest.created_at,
            c.commit?.committer?.date || c.commit?.author?.date
          ),
          isMerge: c.parents?.length > 1 || false, // merge commits have multiple parents
          message: c.commit?.message || ''
        }))
        .filter((c) => c.date)

      if (commitsWithAges.length > 0) {
        // Calculate overall stats using all commits (including merges)
        const ages = commitsWithAges.map((c) => c.age)
        const sum = ages.reduce((a, b) => a + b, 0)
        ltcAvgHours = Number((sum / ages.length).toFixed(2))
        ltcOldestHours = Number(Math.max(...ages).toFixed(2))

        // Find oldest commit (can be merge or non-merge)
        const oldestCommit = commitsWithAges.find(
          (c) => c.age === Math.max(...ages)
        )
        oldestCommitSha = oldestCommit?.sha

        // Find newest NON-MERGE commit (unless includeMergeCommits is true)
        let candidateCommits = commitsWithAges
        if (!this.options.includeMergeCommits) {
          candidateCommits = commitsWithAges.filter((c) => !c.isMerge)
        }

        if (candidateCommits.length > 0) {
          const newestCommit = candidateCommits.find(
            (c) => c.age === Math.min(...candidateCommits.map((nc) => nc.age))
          )
          newestCommitSha = newestCommit?.sha
          ltcNewestHours = Number(
            Math.min(...candidateCommits.map((c) => c.age)).toFixed(2)
          )
        } else {
          // Fallback: if all commits are merges and we're excluding them,
          // use the newest merge commit
          const newestCommit = commitsWithAges.find(
            (c) => c.age === Math.min(...ages)
          )
          newestCommitSha = newestCommit?.sha
          ltcNewestHours = Number(Math.min(...ages).toFixed(2))
        }
      }
    }

    return {
      commit_count: commitDates.length,
      avg_hours: ltcAvgHours,
      oldest_hours: ltcOldestHours,
      newest_hours: ltcNewestHours,
      oldest_commit_sha: oldestCommitSha,
      newest_commit_sha: newestCommitSha,
      newest_excludes_merges: !this.options.includeMergeCommits
    }
  }
}
