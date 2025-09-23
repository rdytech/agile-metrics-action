/**
 * Unit tests for GitHub client
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock @actions/core
const mockCore = {
  warning: jest.fn()
}

// Mock @actions/github
const mockOctokit = {
  request: jest.fn()
}

const mockGetOctokit = jest.fn(() => mockOctokit)

jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))

const { GitHubClient } = await import('../src/github-client.js')

describe('GitHubClient', () => {
  let client

  beforeEach(() => {
    jest.clearAllMocks()
    client = new GitHubClient('test-token', 'test-owner', 'test-repo')
  })

  describe('listReleases', () => {
    it('should return filtered and sorted releases', async () => {
      const mockReleases = [
        {
          name: 'v1.0.0',
          tag_name: 'v1.0.0',
          created_at: '2023-01-01T00:00:00Z',
          draft: false
        },
        {
          name: 'v2.0.0',
          tag_name: 'v2.0.0',
          created_at: '2023-01-02T00:00:00Z',
          draft: false
        },
        {
          name: 'v3.0.0-draft',
          tag_name: 'v3.0.0-draft',
          created_at: '2023-01-03T00:00:00Z',
          draft: true
        }
      ]

      mockOctokit.request.mockResolvedValue({ data: mockReleases })

      const result = await client.listReleases()

      expect(result).toHaveLength(2)
      expect(result[0].tag_name).toBe('v2.0.0') // Most recent first
      expect(result[1].tag_name).toBe('v1.0.0')
    })

    it('should handle API errors gracefully', async () => {
      mockOctokit.request.mockRejectedValue(new Error('API Error'))

      const result = await client.listReleases()

      expect(result).toEqual([])
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to fetch releases: API Error'
      )
    })
  })

  describe('listTags', () => {
    it('should return tags', async () => {
      const mockTags = [{ name: 'v1.0.0' }, { name: 'v2.0.0' }]

      mockOctokit.request.mockResolvedValue({ data: mockTags })

      const result = await client.listTags()

      expect(result).toEqual(mockTags)
    })

    it('should handle API errors gracefully', async () => {
      mockOctokit.request.mockRejectedValue(new Error('API Error'))

      const result = await client.listTags()

      expect(result).toEqual([])
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to fetch tags: API Error'
      )
    })
  })

  describe('resolveTag', () => {
    it('should resolve annotated tag', async () => {
      const mockRefResponse = {
        data: {
          object: {
            type: 'tag',
            sha: 'tag-sha'
          }
        }
      }

      const mockTagResponse = {
        data: {
          tagger: { date: '2023-01-01T00:00:00Z' },
          object: {
            type: 'commit',
            sha: 'commit-sha'
          }
        }
      }

      mockOctokit.request
        .mockResolvedValueOnce(mockRefResponse)
        .mockResolvedValueOnce(mockTagResponse)

      const result = await client.resolveTag('v1.0.0')

      expect(result).toEqual({
        name: 'v1.0.0',
        sha: 'commit-sha',
        created_at: '2023-01-01T00:00:00Z'
      })
    })

    it('should resolve lightweight tag', async () => {
      const mockRefResponse = {
        data: {
          object: {
            type: 'commit',
            sha: 'commit-sha'
          }
        }
      }

      const mockCommitResponse = {
        data: {
          commit: {
            committer: { date: '2023-01-01T00:00:00Z' }
          }
        }
      }

      mockOctokit.request
        .mockResolvedValueOnce(mockRefResponse)
        .mockResolvedValueOnce(mockCommitResponse)

      const result = await client.resolveTag('v1.0.0')

      expect(result).toEqual({
        name: 'v1.0.0',
        sha: 'commit-sha',
        created_at: '2023-01-01T00:00:00Z'
      })
    })

    it('should handle API errors gracefully', async () => {
      mockOctokit.request.mockRejectedValue(new Error('Tag not found'))

      const result = await client.resolveTag('v1.0.0')

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to resolve tag v1.0.0: Tag not found'
      )
    })
  })

  describe('compareCommits', () => {
    it('should return comparison result', async () => {
      const mockResponse = {
        data: {
          commits: [{ sha: 'commit1', commit: { message: 'First commit' } }],
          total_commits: 1
        }
      }

      mockOctokit.request.mockResolvedValue(mockResponse)

      const result = await client.compareCommits('base', 'head')

      expect(result).toEqual({
        truncated: false,
        commits: mockResponse.data.commits
      })
    })

    it('should handle API errors gracefully', async () => {
      mockOctokit.request.mockRejectedValue(new Error('Compare failed'))

      const result = await client.compareCommits('base', 'head')

      expect(result).toEqual({ truncated: true, commits: [] })
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Compare failed (base...head): Compare failed'
      )
    })
  })

  describe('getCommit', () => {
    it('should return commit data', async () => {
      const mockCommit = {
        data: {
          sha: 'commit-sha',
          commit: { message: 'Test commit' }
        }
      }

      mockOctokit.request.mockResolvedValue(mockCommit)

      const result = await client.getCommit('commit-sha')

      expect(result).toEqual(mockCommit.data)
    })

    it('should handle API errors gracefully', async () => {
      mockOctokit.request.mockRejectedValue(new Error('Commit not found'))

      const result = await client.getCommit('commit-sha')

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to get commit commit-sha: Commit not found'
      )
    })
  })
})
