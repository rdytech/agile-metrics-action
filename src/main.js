import * as core from '@actions/core'
import * as github from '@actions/github'
import { GitHubClient } from './github-client.js'
import { MetricsCollector } from './metrics-collector.js'
import { DevExMetricsCollector } from './devex-metrics-collector.js'
import { OutputManager } from './outputs.js'
import {
  validatePositiveInteger,
  validateBoolean,
  sanitizeFilePath
} from './utils.js'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    // Get inputs
    const githubToken = core.getInput('github-token', { required: true })
    const outputPath = sanitizeFilePath(
      core.getInput('output-path') || 'metrics/delivery_metrics.json'
    )
    const commitResults = validateBoolean(
      core.getInput('commit-results') || 'true',
      'commit-results'
    )
    const includeMergeCommits = validateBoolean(
      core.getInput('include-merge-commits') || 'false',
      'include-merge-commits'
    )
    const maxReleases = validatePositiveInteger(
      core.getInput('max-releases') || '100',
      'max-releases'
    )
    const maxTags = validatePositiveInteger(
      core.getInput('max-tags') || '100',
      'max-tags'
    )
    const enableDoraMetrics = validateBoolean(
      core.getInput('enable-dora-metrics') || 'true',
      'enable-dora-metrics'
    )
    const enableDevExMetrics = validateBoolean(
      core.getInput('enable-devex-metrics') || 'false',
      'enable-devex-metrics'
    )
    const filesToIgnore = core
      .getInput('files-to-ignore')
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
    const ignoreLineDeletions = validateBoolean(
      core.getInput('ignore-line-deletions') || 'false',
      'ignore-line-deletions'
    )
    const ignoreFileDeletions = validateBoolean(
      core.getInput('ignore-file-deletions') || 'false',
      'ignore-file-deletions'
    )

    // Validate that at least one metrics type is enabled
    if (!enableDoraMetrics && !enableDevExMetrics) {
      throw new Error(
        'At least one metrics type must be enabled (enable-dora-metrics or enable-devex-metrics)'
      )
    }

    // Get repository context
    const { owner, repo } = github.context.repo

    core.info(`Collecting metrics for ${owner}/${repo}`)
    core.debug(
      `Configuration: outputPath=${outputPath}, commitResults=${commitResults}, includeMergeCommits=${includeMergeCommits}`
    )
    core.debug(
      `Metrics enabled: DORA=${enableDoraMetrics}, DevEx=${enableDevExMetrics}`
    )

    // Initialize components
    const githubClient = new GitHubClient(githubToken, owner, repo)
    const outputManager = new OutputManager({
      commitResults,
      outputPath
    })

    let combinedMetricsData = {
      timestamp: new Date().toISOString(),
      repository: `${owner}/${repo}`,
      metrics: {}
    }

    // Collect DORA metrics if enabled
    if (enableDoraMetrics) {
      core.info(
        'Collecting DORA metrics (deployment frequency and lead time)...'
      )
      const metricsCollector = new MetricsCollector(githubClient, {
        includeMergeCommits,
        maxReleases,
        maxTags
      })
      const doraMetrics = await metricsCollector.collectMetrics()

      // Merge DORA metrics into combined data
      combinedMetricsData = {
        ...combinedMetricsData,
        ...doraMetrics,
        metrics: {
          ...combinedMetricsData.metrics,
          dora: doraMetrics.metrics || {}
        }
      }
    }

    // Collect DevEx metrics if enabled
    if (enableDevExMetrics) {
      core.info(
        'Collecting DevEx metrics (PR size and developer experience)...'
      )
      const devexCollector = new DevExMetricsCollector(githubClient, {
        filesToIgnore,
        ignoreLineDeletions,
        ignoreFileDeletions
      })
      const devexMetrics = await devexCollector.collectMetrics()

      // Merge DevEx metrics into combined data
      combinedMetricsData.metrics.devex = devexMetrics.metrics || {}

      // Add PR comments and labels if we have PR size metrics
      if (devexMetrics.pr_number && devexMetrics.metrics?.pr_size) {
        await devexCollector.addPRComment(
          devexMetrics.pr_number,
          devexMetrics.metrics.pr_size,
          devexMetrics.metrics.pr_maturity
        )
        await devexCollector.addPRLabel(
          devexMetrics.pr_number,
          devexMetrics.metrics.pr_size.category
        )
      }

      // Set DevEx-specific outputs
      if (devexMetrics.metrics?.pr_size) {
        core.setOutput('pr-size', devexMetrics.metrics.pr_size.size)
        core.setOutput(
          'pr-size-category',
          devexMetrics.metrics.pr_size.category
        )
        core.setOutput(
          'pr-size-details',
          JSON.stringify(devexMetrics.metrics.pr_size.details)
        )
      }

      if (devexMetrics.metrics?.pr_maturity) {
        core.setOutput(
          'pr-maturity-ratio',
          devexMetrics.metrics.pr_maturity.maturity_ratio?.toString() || ''
        )
        core.setOutput(
          'pr-maturity-percentage',
          devexMetrics.metrics.pr_maturity.maturity_percentage?.toString() || ''
        )
        core.setOutput(
          'pr-maturity-details',
          JSON.stringify(devexMetrics.metrics.pr_maturity.details)
        )
      }
    }

    // Process outputs
    core.info('Processing outputs...')
    await outputManager.processOutputs(combinedMetricsData)

    // Log success
    if (combinedMetricsData.error) {
      core.warning(
        `Metrics collection completed with error: ${combinedMetricsData.error}`
      )
    } else {
      core.info('Metrics collection completed successfully')

      if (enableDoraMetrics && combinedMetricsData.source) {
        core.info(`DORA Source: ${combinedMetricsData.source}`)
        core.info(`Latest: ${combinedMetricsData.latest?.tag || 'N/A'}`)
        core.info(
          `Deployment frequency: ${combinedMetricsData.metrics?.dora?.deployment_frequency_days ?? 'N/A'} days`
        )
        core.info(
          `Lead time (avg): ${combinedMetricsData.metrics?.dora?.lead_time_for_change?.avg_hours ?? 'N/A'} hours`
        )
      }

      if (enableDevExMetrics && combinedMetricsData.metrics?.devex?.pr_size) {
        core.info(
          `PR Size: ${combinedMetricsData.metrics.devex.pr_size.size} (${combinedMetricsData.metrics.devex.pr_size.details.total_changes} changes)`
        )
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.error(`Action failed: ${error.message}`)
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}
