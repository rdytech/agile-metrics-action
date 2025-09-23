import * as core from '@actions/core'
import * as github from '@actions/github'
import { GitHubClient } from './github-client.js'
import { MetricsCollector } from './metrics-collector.js'
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

    // Get repository context
    const { owner, repo } = github.context.repo

    core.info(`Collecting metrics for ${owner}/${repo}`)
    core.debug(
      `Configuration: outputPath=${outputPath}, commitResults=${commitResults}, includeMergeCommits=${includeMergeCommits}`
    )

    // Initialize components
    const githubClient = new GitHubClient(githubToken, owner, repo)
    const metricsCollector = new MetricsCollector(githubClient, {
      includeMergeCommits,
      maxReleases,
      maxTags
    })
    const outputManager = new OutputManager({
      commitResults,
      outputPath
    })

    // Collect metrics
    core.info('Collecting deployment frequency and lead time metrics...')
    const metricsData = await metricsCollector.collectMetrics()

    // Process outputs
    core.info('Processing outputs...')
    await outputManager.processOutputs(metricsData)

    // Log success
    if (metricsData.error) {
      core.warning(
        `Metrics collection completed with error: ${metricsData.error}`
      )
    } else {
      core.info('Metrics collection completed successfully')
      core.info(`Source: ${metricsData.source}`)
      core.info(`Latest: ${metricsData.latest.tag}`)
      core.info(
        `Deployment frequency: ${metricsData.metrics.deployment_frequency_days ?? 'N/A'} days`
      )
      core.info(
        `Lead time (avg): ${metricsData.metrics.lead_time_for_change.avg_hours ?? 'N/A'} hours`
      )
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
