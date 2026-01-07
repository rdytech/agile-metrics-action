/**
 * Unit tests for the main action
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock dependencies
const mockCore = {
  getInput: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  summary: {
    addRaw: jest.fn(() => ({ write: jest.fn() }))
  }
}

const mockGithub = {
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  }
}

const mockGitHubClient = {
  listReleases: jest.fn(),
  listTags: jest.fn(),
  resolveTag: jest.fn(),
  compareCommits: jest.fn(),
  getCommit: jest.fn()
}

const mockMetricsCollector = {
  collectMetrics: jest.fn()
}

const mockDevExMetricsCollector = {
  collectMetrics: jest.fn(),
  addPRComment: jest.fn(),
  addPRLabel: jest.fn()
}

const mockOutputManager = {
  processOutputs: jest.fn()
}

// Setup mocks
jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('@actions/github', () => mockGithub)
jest.unstable_mockModule('../src/github-client.js', () => ({
  GitHubClient: jest.fn(() => mockGitHubClient)
}))
jest.unstable_mockModule('../src/metrics-collector.js', () => ({
  MetricsCollector: jest.fn(() => mockMetricsCollector)
}))
jest.unstable_mockModule('../src/devex-metrics-collector.js', () => ({
  DevExMetricsCollector: jest.fn(() => mockDevExMetricsCollector)
}))
jest.unstable_mockModule('../src/outputs.js', () => ({
  OutputManager: jest.fn(() => mockOutputManager)
}))

// Import the function under test
const { run } = await import('../src/main.js')

describe('main action', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Setup default input values
    mockCore.getInput.mockImplementation((name) => {
      const inputs = {
        'github-token': 'test-token',
        'output-path': 'metrics/delivery_metrics.json',
        'commit-results': 'true',
        'include-merge-commits': 'false',
        'max-releases': '100',
        'max-tags': '100',
        'deployment-frequency': 'true',
        'lead-time': 'false',
        'pr-size': 'false',
        'pr-maturity': 'false',
        'files-to-ignore': '',
        'ignore-line-deletions': 'false',
        'ignore-file-deletions': 'false'
      }
      return inputs[name] || ''
    })
  })

  it('should run successfully with valid metrics', async () => {
    const mockMetrics = {
      source: 'release',
      latest: { tag: 'v1.0.0' },
      metrics: {
        deployment_frequency_days: 7,
        lead_time_for_change: {
          avg_hours: 24
        }
      }
    }

    mockMetricsCollector.collectMetrics.mockResolvedValue(mockMetrics)
    mockOutputManager.processOutputs.mockResolvedValue()

    await run()

    expect(mockCore.info).toHaveBeenCalledWith(
      'Collecting metrics for test-owner/test-repo'
    )
    expect(mockCore.info).toHaveBeenCalledWith(
      'Metrics collection completed successfully'
    )
    expect(mockCore.setFailed).not.toHaveBeenCalled()
  })

  it('should require at least one metric to be enabled', async () => {
    mockCore.getInput.mockImplementation((name) => {
      const inputs = {
        'github-token': 'test-token',
        'deployment-frequency': 'false',
        'lead-time': 'false',
        'pr-size': 'false',
        'pr-maturity': 'false',
        'team-metrics': 'false'
      }
      return inputs[name] || ''
    })

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'At least one metric must be enabled (deployment-frequency, lead-time, pr-size, pr-maturity, or team-metrics)'
    )
  })

  it('should collect only enabled metrics', async () => {
    mockCore.getInput.mockImplementation((name) => {
      const inputs = {
        'github-token': 'test-token',
        'deployment-frequency': 'true',
        'lead-time': 'true',
        'pr-size': 'false',
        'pr-maturity': 'false'
      }
      return inputs[name] || ''
    })

    const mockMetrics = {
      source: 'release',
      latest: { tag: 'v1.0.0' },
      metrics: {
        deployment_frequency_days: 7,
        lead_time_for_change: {
          avg_hours: 24
        }
      }
    }

    mockMetricsCollector.collectMetrics.mockResolvedValue(mockMetrics)
    mockOutputManager.processOutputs.mockResolvedValue()

    await run()

    expect(mockMetricsCollector.collectMetrics).toHaveBeenCalled()
    expect(mockDevExMetricsCollector.collectMetrics).not.toHaveBeenCalled()
    expect(mockCore.setFailed).not.toHaveBeenCalled()
  })

  it('should handle metrics collection errors gracefully', async () => {
    const mockMetrics = {
      error: 'No releases or tags found'
    }

    mockMetricsCollector.collectMetrics.mockResolvedValue(mockMetrics)
    mockOutputManager.processOutputs.mockResolvedValue()

    await run()

    expect(mockCore.warning).toHaveBeenCalledWith(
      'Metrics collection completed with error: No releases or tags found'
    )
    expect(mockCore.setFailed).not.toHaveBeenCalled()
  })

  it('should handle unexpected errors', async () => {
    const error = new Error('Unexpected error')
    mockMetricsCollector.collectMetrics.mockRejectedValue(error)

    await run()

    expect(mockCore.error).toHaveBeenCalledWith(
      'Action failed: Unexpected error'
    )
    expect(mockCore.setFailed).toHaveBeenCalledWith('Unexpected error')
  })

  it('should validate boolean inputs correctly', async () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'commit-results') return 'invalid'
      return 'test-token'
    })

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      "commit-results must be 'true' or 'false', got: invalid"
    )
  })

  it('should validate positive integer inputs correctly', async () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'max-releases') return '-1'
      return name === 'github-token' ? 'test-token' : 'true'
    })

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'max-releases must be a positive integer, got: -1'
    )
  })
})
