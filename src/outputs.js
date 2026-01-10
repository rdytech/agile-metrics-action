import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { writeJsonFile, formatHoursToDays } from './utils.js'

/**
 * Handle all output operations for the action
 */
export class OutputManager {
  /**
   * Create a new output manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      commitResults: true,
      outputPath: 'metrics/delivery_metrics.json',
      ...options
    }
  }

  /**
   * Process and output all metrics data
   * @param {Object} metricsData - Complete metrics data
   * @returns {Promise<void>}
   */
  async processOutputs(metricsData) {
    try {
      // Write JSON file
      const filePath = await this.writeMetricsFile(metricsData)

      // Set GitHub Actions outputs
      this.setActionOutputs(metricsData, filePath)

      // Create markdown summary
      await this.createMarkdownSummary(metricsData)

      // Commit results if requested and not in PR context
      if (
        this.options.commitResults &&
        process.env.GITHUB_EVENT_NAME !== 'pull_request'
      ) {
        await this.commitResults(filePath)
      }
    } catch (error) {
      core.error(`Failed to process outputs: ${error.message}`)
      throw error
    }
  }

  /**
   * Write metrics data to JSON file
   * @param {Object} metricsData - Metrics data to write
   * @returns {Promise<string>} Path to the written file
   */
  async writeMetricsFile(metricsData) {
    try {
      writeJsonFile(this.options.outputPath, metricsData)
      core.info(`Metrics written to ${this.options.outputPath}`)
      return this.options.outputPath
    } catch (error) {
      core.error(`Failed to write metrics file: ${error.message}`)
      throw error
    }
  }

  /**
   * Set GitHub Actions outputs
   * @param {Object} metricsData - Metrics data
   * @param {string} filePath - Path to metrics file
   */
  setActionOutputs(metricsData, filePath) {
    // Set the complete metrics as JSON output
    core.setOutput('metrics-json', JSON.stringify(metricsData))
    core.setOutput('metrics-file-path', filePath)

    // Handle error case
    if (metricsData.error) {
      core.warning(`Metrics collection error: ${metricsData.error}`)
      return
    }

    // Set DORA metric outputs if available
    const doraMetrics = metricsData.metrics?.dora
    if (doraMetrics) {
      const ct = doraMetrics.cycle_time

      core.setOutput(
        'deployment-frequency',
        doraMetrics.deploy_frequency_days?.toString() || ''
      )
      core.setOutput('lead-time-avg', ct?.avg_hours?.toString() || '')
      core.setOutput('lead-time-oldest', ct?.oldest_hours?.toString() || '')
      core.setOutput('lead-time-newest', ct?.newest_hours?.toString() || '')
      core.setOutput('commit-count', ct?.commit_count?.toString() || '0')
    }

    // DevEx outputs are set in main.js to avoid coupling
  }

  /**
   * Create markdown summary for the workflow
   * @param {Object} metricsData - Metrics data
   */
  async createMarkdownSummary(metricsData) {
    try {
      if (metricsData.error) {
        const errorSummary = `
### Agile Metrics - Error
❌ **Error:** ${metricsData.error}
        `
        await core.summary.addRaw(errorSummary).write()
        return
      }

      let summary = `### Agile Metrics Summary\n`

      // Add DORA metrics section if available
      const doraMetrics = metricsData.metrics?.dora
      if (doraMetrics) {
        const ct = doraMetrics.cycle_time
        summary += `
#### DORA Metrics
- **Source:** ${metricsData.source}
- **Latest:** ${metricsData.latest?.tag} @ ${metricsData.latest?.created_at}
- **Deploy Frequency (days):** ${doraMetrics.deploy_frequency_days ?? 'N/A'}
- **Cycle Time:** ${formatHoursToDays(ct?.avg_hours)}
  - Number of commits: ${ct?.commit_count || 0}
  - Oldest: ${formatHoursToDays(ct?.oldest_hours)} ${ct?.oldest_commit_sha ? `(${ct.oldest_commit_sha.substring(0, 7)})` : ''}
  - Newest: ${formatHoursToDays(ct?.newest_hours)} ${ct?.newest_commit_sha ? `(${ct.newest_commit_sha.substring(0, 7)})` : ''}
        `
      }

      // Add DevEx metrics section if available
      const devexMetrics = metricsData.metrics?.devex
      if (devexMetrics?.pr_size || devexMetrics?.pr_maturity) {
        summary += `
#### DevEx Metrics`

        if (devexMetrics?.pr_size) {
          const prSize = devexMetrics.pr_size
          const emoji = this.getSizeEmoji(prSize.size)
          const sizeRating = this.getSizeRating(prSize.size)
          const sizeRatingEmoji = this.getRatingEmoji(sizeRating)
          summary += `
- **PR Size:** ${emoji} ${prSize.size.toUpperCase()} ${sizeRatingEmoji} ${sizeRating} (${prSize.category})
- **Total Changes:** ${prSize.details.total_changes}
- **Lines Added:** ${prSize.details.total_additions}
- **Lines Removed:** ${prSize.details.total_deletions}
- **Files Changed:** ${prSize.details.files_changed}`
        }

        if (devexMetrics?.pr_maturity) {
          const maturity = devexMetrics.pr_maturity
          const maturityEmoji = this.getMaturityEmoji(
            maturity.maturity_percentage
          )
          const maturityLevel = this.getMaturityLevel(
            maturity.maturity_percentage
          )
          const maturityRatingEmoji = this.getRatingEmoji(maturityLevel)
          summary += `
- **PR Maturity:** ${maturityEmoji} ${maturity.maturity_percentage}% ${maturityRatingEmoji} ${maturityLevel} (${maturity.maturity_ratio})`

          if (maturity.details && !maturity.details.error) {
            summary += `
- **Total Commits:** ${maturity.details.total_commits}
- **Stable Changes:** ${maturity.details.stable_changes}
- **Changes After Publication:** ${maturity.details.changes_after_publication}`
          }
        }
      }

      await core.summary.addRaw(summary).write()
      core.info('Markdown summary created')
    } catch (error) {
      core.warning(`Failed to create markdown summary: ${error.message}`)
    }
  }

  /**
   * Get emoji for PR size category
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
   * Commit the metrics file to the repository
   * @param {string} filePath - Path to the metrics file
   */
  async commitResults(filePath) {
    try {
      // Configure git user
      await exec.exec('git', ['config', 'user.name', 'github-actions[bot]'])
      await exec.exec('git', [
        'config',
        'user.email',
        '41898282+github-actions[bot]@users.noreply.github.com'
      ])

      // Generate timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '')
        .replace('T', 'T')
        .replace('Z', 'Z')

      // Add, commit, and push
      await exec.exec('git', ['add', filePath])

      const commitMessage = `devex: delivery metrics ${timestamp}`

      try {
        await exec.exec('git', ['commit', '-m', commitMessage])
        await exec.exec('git', ['push'])
        core.info('Metrics committed and pushed successfully')
      } catch (commitError) {
        // This might fail if there are no changes, which is OK
        core.info('No changes to commit or push failed')
      }
    } catch (error) {
      core.warning(`Failed to commit results: ${error.message}`)
    }
  }
}
