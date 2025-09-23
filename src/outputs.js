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

    // Set individual metric outputs
    const metrics = metricsData.metrics
    const ltc = metrics.lead_time_for_change

    core.setOutput(
      'deployment-frequency',
      metrics.deployment_frequency_days?.toString() || ''
    )
    core.setOutput('lead-time-avg', ltc.avg_hours?.toString() || '')
    core.setOutput('lead-time-oldest', ltc.oldest_hours?.toString() || '')
    core.setOutput('lead-time-newest', ltc.newest_hours?.toString() || '')
    core.setOutput('commit-count', ltc.commit_count?.toString() || '0')
  }

  /**
   * Create markdown summary for the workflow
   * @param {Object} metricsData - Metrics data
   */
  async createMarkdownSummary(metricsData) {
    try {
      if (metricsData.error) {
        const errorSummary = `
### Delivery Metrics - Error
❌ **Error:** ${metricsData.error}
        `
        await core.summary.addRaw(errorSummary).write()
        return
      }

      const metrics = metricsData.metrics
      const ltc = metrics.lead_time_for_change

      const summary = `
### Delivery Metrics
- **Source:** ${metricsData.source}
- **Latest:** ${metricsData.latest.tag} @ ${metricsData.latest.created_at}
- **Deployment Frequency (days):** ${metrics.deployment_frequency_days ?? 'N/A'}
- **Lead Time for Change**
  - commit_count: ${ltc.commit_count}
  - avg: ${formatHoursToDays(ltc.avg_hours)}
  - oldest: ${formatHoursToDays(ltc.oldest_hours)} ${ltc.oldest_commit_sha ? `(${ltc.oldest_commit_sha.substring(0, 7)})` : ''}
  - newest: ${formatHoursToDays(ltc.newest_hours)} ${ltc.newest_commit_sha ? `(${ltc.newest_commit_sha.substring(0, 7)})` : ''}
      `

      await core.summary.addRaw(summary).write()
      core.info('Markdown summary created')
    } catch (error) {
      core.warning(`Failed to create markdown summary: ${error.message}`)
    }
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
