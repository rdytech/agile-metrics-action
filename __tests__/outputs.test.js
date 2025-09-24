/**
 * Unit tests for OutputManager
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock dependencies
const mockCore = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setOutput: jest.fn(),
  summary: {
    addRaw: jest.fn(() => ({ write: jest.fn() }))
  }
}

const mockExec = {
  exec: jest.fn()
}

const mockUtils = {
  writeJsonFile: jest.fn(),
  formatHoursToDays: jest.fn((hours) =>
    hours ? `${hours / 24} days (${hours}h)` : 'N/A'
  )
}

jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('@actions/exec', () => mockExec)
jest.unstable_mockModule('../src/utils.js', () => mockUtils)

const { OutputManager } = await import('../src/outputs.js')

describe('OutputManager', () => {
  let outputManager

  beforeEach(() => {
    jest.clearAllMocks()
    outputManager = new OutputManager({
      commitResults: true,
      outputPath: 'test-metrics.json'
    })

    // Mock environment
    delete process.env.GITHUB_EVENT_NAME
  })

  describe('processOutputs', () => {
    it('should process outputs successfully', async () => {
      const mockMetrics = {
        source: 'release',
        latest: { tag: 'v1.0.0', created_at: '2023-01-01T00:00:00Z' },
        metrics: {
          dora: {
            deployment_frequency_days: 7,
            lead_time_for_change: {
              commit_count: 5,
              avg_hours: 24,
              oldest_hours: 48,
              newest_hours: 12,
              oldest_commit_sha: 'old123',
              newest_commit_sha: 'new456'
            }
          }
        }
      }

      await outputManager.processOutputs(mockMetrics)

      expect(mockUtils.writeJsonFile).toHaveBeenCalledWith(
        'test-metrics.json',
        mockMetrics
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'metrics-json',
        JSON.stringify(mockMetrics)
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'metrics-file-path',
        'test-metrics.json'
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'deployment-frequency',
        '7'
      )
    })

    it('should handle error metrics', async () => {
      const mockMetrics = {
        error: 'No releases found'
      }

      await outputManager.processOutputs(mockMetrics)

      expect(mockCore.warning).toHaveBeenCalledWith(
        'Metrics collection error: No releases found'
      )
      expect(mockCore.summary.addRaw).toHaveBeenCalledWith(
        expect.stringContaining('❌ **Error:** No releases found')
      )
    })

    it('should skip commit when in pull request context', async () => {
      process.env.GITHUB_EVENT_NAME = 'pull_request'

      const mockMetrics = {
        source: 'release',
        metrics: {
          deployment_frequency_days: null,
          lead_time_for_change: {
            commit_count: 0,
            avg_hours: null,
            oldest_hours: null,
            newest_hours: null
          }
        }
      }

      await outputManager.processOutputs(mockMetrics)

      expect(mockExec.exec).not.toHaveBeenCalled()
    })

    it('should commit results when enabled and not in PR', async () => {
      const mockMetrics = {
        source: 'release',
        metrics: {
          deployment_frequency_days: null,
          lead_time_for_change: {
            commit_count: 0,
            avg_hours: null,
            oldest_hours: null,
            newest_hours: null
          }
        }
      }

      await outputManager.processOutputs(mockMetrics)

      expect(mockExec.exec).toHaveBeenCalledWith('git', [
        'config',
        'user.name',
        'github-actions[bot]'
      ])
      expect(mockExec.exec).toHaveBeenCalledWith('git', [
        'add',
        'test-metrics.json'
      ])
    })
  })

  describe('setActionOutputs', () => {
    it('should set individual metric outputs', () => {
      const mockMetrics = {
        metrics: {
          dora: {
            deployment_frequency_days: 5.5,
            lead_time_for_change: {
              commit_count: 3,
              avg_hours: 18.5,
              oldest_hours: 36,
              newest_hours: 6
            }
          }
        }
      }

      outputManager.setActionOutputs(mockMetrics, 'test-path.json')

      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'deployment-frequency',
        '5.5'
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('lead-time-avg', '18.5')
      expect(mockCore.setOutput).toHaveBeenCalledWith('commit-count', '3')
    })

    it('should handle null metric values', () => {
      const mockMetrics = {
        metrics: {
          dora: {
            deployment_frequency_days: null,
            lead_time_for_change: {
              commit_count: 0,
              avg_hours: null,
              oldest_hours: null,
              newest_hours: null
            }
          }
        }
      }

      outputManager.setActionOutputs(mockMetrics, 'test-path.json')

      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'deployment-frequency',
        ''
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('lead-time-avg', '')
      expect(mockCore.setOutput).toHaveBeenCalledWith('commit-count', '0')
    })
  })

  describe('createMarkdownSummary', () => {
    it('should create summary with metrics', async () => {
      const mockMetrics = {
        source: 'release',
        latest: { tag: 'v1.0.0', created_at: '2023-01-01T00:00:00Z' },
        metrics: {
          dora: {
            deployment_frequency_days: 7,
            lead_time_for_change: {
              commit_count: 5,
              avg_hours: 24,
              oldest_hours: 48,
              newest_hours: 12,
              oldest_commit_sha: 'old123',
              newest_commit_sha: 'new456'
            }
          }
        }
      }

      await outputManager.createMarkdownSummary(mockMetrics)

      expect(mockCore.summary.addRaw).toHaveBeenCalledWith(
        expect.stringContaining('### Agile Metrics Summary')
      )
      expect(mockCore.summary.addRaw).toHaveBeenCalledWith(
        expect.stringContaining('**Source:** release')
      )
    })

    it('should create error summary', async () => {
      const mockMetrics = {
        error: 'Test error message'
      }

      await outputManager.createMarkdownSummary(mockMetrics)

      expect(mockCore.summary.addRaw).toHaveBeenCalledWith(
        expect.stringContaining('### Agile Metrics - Error')
      )
      expect(mockCore.summary.addRaw).toHaveBeenCalledWith(
        expect.stringContaining('❌ **Error:** Test error message')
      )
    })
  })

  describe('commitResults', () => {
    it('should handle git commit failure gracefully', async () => {
      mockExec.exec.mockImplementation((command, args) => {
        if (command === 'git' && args[0] === 'commit') {
          throw new Error('No changes to commit')
        }
      })

      await outputManager.commitResults('test-file.json')

      expect(mockCore.info).toHaveBeenCalledWith(
        'No changes to commit or push failed'
      )
    })

    it('should handle git configuration errors', async () => {
      mockExec.exec.mockRejectedValue(new Error('Git config failed'))

      await outputManager.commitResults('test-file.json')

      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to commit results: Git config failed'
      )
    })
  })
})
