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
      const ltc = doraMetrics.lead_time_for_change

      core.setOutput(
        'deployment-frequency',
        doraMetrics.deployment_frequency_days?.toString() || ''
      )
      core.setOutput('lead-time-avg', ltc?.avg_hours?.toString() || '')
      core.setOutput('lead-time-oldest', ltc?.oldest_hours?.toString() || '')
      core.setOutput('lead-time-newest', ltc?.newest_hours?.toString() || '')
      core.setOutput('commit-count', ltc?.commit_count?.toString() || '0')
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
        const ltc = doraMetrics.lead_time_for_change
        summary += `
#### DORA Metrics
- **Source:** ${metricsData.source}
- **Latest:** ${metricsData.latest?.tag} @ ${metricsData.latest?.created_at}
- **Deployment Frequency (days):** ${doraMetrics.deployment_frequency_days ?? 'N/A'}
- **Lead Time for Change:** ${formatHoursToDays(ltc?.avg_hours)}
  - Number of commits: ${ltc?.commit_count || 0}
  - Oldest: ${formatHoursToDays(ltc?.oldest_hours)} ${ltc?.oldest_commit_sha ? `(${ltc.oldest_commit_sha.substring(0, 7)})` : ''}
  - Newest: ${formatHoursToDays(ltc?.newest_hours)} ${ltc?.newest_commit_sha ? `(${ltc.newest_commit_sha.substring(0, 7)})` : ''}
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
          summary += `
- **PR Size:** ${emoji} ${prSize.size.toUpperCase()} (${prSize.category})
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
          summary += `
- **PR Maturity:** ${maturityEmoji} ${maturity.maturity_percentage}% (${maturity.maturity_ratio})`

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
      xs: '🤏',
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
    if (percentage >= 90) return '🎯'
    if (percentage >= 75) return '✅'
    if (percentage >= 50) return '⚠️'
    if (percentage >= 25) return '🚧'
    return '❌'
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
