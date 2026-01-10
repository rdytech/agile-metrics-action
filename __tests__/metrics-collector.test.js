/**
 * Unit tests for MetricsCollector
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock @actions/core
const mockCore = {
  error: jest.fn()
}

// Mock dependencies
const mockGitHubClient = {
  owner: 'test-owner',
  repo: 'test-repo',
  listReleases: jest.fn(),
  listTags: jest.fn(),
  resolveTag: jest.fn(),
  compareCommits: jest.fn(),
  getCommit: jest.fn()
}

jest.unstable_mockModule('@actions/core', () => mockCore)

const { MetricsCollector } = await import('../src/metrics-collector.js')

describe('MetricsCollector', () => {
  let collector

  beforeEach(() => {
    jest.clearAllMocks()
    collector = new MetricsCollector(mockGitHubClient, {
      includeMergeCommits: false,
      maxReleases: 100,
      maxTags: 100
    })
  })

  describe('collectMetrics', () => {
    it('should collect metrics from releases', async () => {
      // Mock release data
      const mockReleases = [
        {
          name: 'v2.0.0',
          tag_name: 'v2.0.0',
          created_at: '2023-01-02T00:00:00Z'
        },
        {
          name: 'v1.0.0',
          tag_name: 'v1.0.0',
          created_at: '2023-01-01T00:00:00Z'
        }
      ]

      const mockCompareResult = {
        commits: [
          {
            sha: 'commit1',
            commit: {
              committer: { date: '2023-01-01T12:00:00Z' },
              message: 'Test commit'
            },
            parents: [{ sha: 'parent' }]
          }
        ]
      }

      mockGitHubClient.listReleases.mockResolvedValue(mockReleases)
      mockGitHubClient.resolveTag
        .mockResolvedValueOnce({ sha: 'sha2' })
        .mockResolvedValueOnce({ sha: 'sha1' })
      mockGitHubClient.compareCommits.mockResolvedValue(mockCompareResult)

      const result = await collector.collectMetrics()

      expect(result.source).toBe('release')
      expect(result.latest.tag).toBe('v2.0.0')
      expect(result.metrics.deploy_frequency_days).toBe(1)
      expect(result.metrics.cycle_time.commit_count).toBe(1)
    })

    it('should fallback to tags when no releases', async () => {
      const mockTags = [{ name: 'v1.0.0' }, { name: 'v0.9.0' }]

      mockGitHubClient.listReleases.mockResolvedValue([])
      mockGitHubClient.listTags.mockResolvedValue(mockTags)
      mockGitHubClient.resolveTag
        .mockResolvedValueOnce({
          name: 'v1.0.0',
          sha: 'sha1',
          created_at: '2023-01-01T00:00:00Z'
        })
        .mockResolvedValueOnce({
          name: 'v0.9.0',
          sha: 'sha0',
          created_at: '2022-12-31T00:00:00Z'
        })
      mockGitHubClient.compareCommits.mockResolvedValue({ commits: [] })

      const result = await collector.collectMetrics()

      expect(result.source).toBe('tag')
      expect(result.latest.tag).toBe('v1.0.0')
    })

    it('should handle error when no releases or tags', async () => {
      mockGitHubClient.listReleases.mockResolvedValue([])
      mockGitHubClient.listTags.mockResolvedValue([])

      const result = await collector.collectMetrics()

      expect(result.error).toContain('No releases or tags found')
    })

    it('should handle single tag scenario', async () => {
      const mockTags = [{ name: 'v1.0.0' }]
      const mockCommit = {
        sha: 'commit1',
        commit: {
          committer: { date: '2023-01-01T12:00:00Z' },
          message: 'Initial commit'
        },
        parents: [{ sha: 'parent' }]
      }

      mockGitHubClient.listReleases.mockResolvedValue([])
      mockGitHubClient.listTags.mockResolvedValue(mockTags)
      mockGitHubClient.resolveTag.mockResolvedValueOnce({
        name: 'v1.0.0',
        sha: 'sha1',
        created_at: '2023-01-01T00:00:00Z'
      })
      mockGitHubClient.getCommit.mockResolvedValue(mockCommit)

      const result = await collector.collectMetrics()

      expect(result.source).toBe('tag')
      expect(result.previous).toBeNull()
      expect(result.metrics.deploy_frequency_days).toBeNull()
    })
  })

  describe('calculateCycleTime', () => {
    it('should exclude merge commits from newest calculation', async () => {
      const latest = { created_at: '2023-01-02T00:00:00Z' }
      const previous = { sha: 'prev-sha' }

      const mockCommits = [
        {
          sha: 'commit1',
          commit: {
            committer: { date: '2023-01-01T12:00:00Z' },
            message: 'Regular commit'
          },
          parents: [{ sha: 'parent' }] // Single parent = not a merge
        },
        {
          sha: 'commit2',
          commit: {
            committer: { date: '2023-01-01T18:00:00Z' },
            message: 'Merge commit'
          },
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }] // Multiple parents = merge
        }
      ]

      mockGitHubClient.compareCommits.mockResolvedValue({
        commits: mockCommits
      })

      const result = await collector.calculateCycleTime(latest, previous)

      expect(result.commit_count).toBe(2)
      expect(result.newest_excludes_merges).toBe(true)
      expect(result.newest_commit_sha).toBe('commit1') // Regular commit, not merge
    })

    it('should include merge commits when configured', async () => {
      collector.options.includeMergeCommits = true

      const latest = { created_at: '2023-01-02T00:00:00Z' }
      const previous = { sha: 'prev-sha' }

      const mockCommits = [
        {
          sha: 'commit1',
          commit: {
            committer: { date: '2023-01-01T18:00:00Z' },
            message: 'Merge commit'
          },
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      ]

      mockGitHubClient.compareCommits.mockResolvedValue({
        commits: mockCommits
      })

      const result = await collector.calculateCycleTime(latest, previous)

      expect(result.newest_commit_sha).toBe('commit1')
      expect(result.newest_excludes_merges).toBe(false)
    })
  })
})
