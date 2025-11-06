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

  describe('Pull Request Operations', () => {
    it('should get pull request successfully', async () => {
      const mockPR = {
        number: 123,
        title: 'Test PR',
        state: 'open'
      }

      mockOctokit.request.mockResolvedValueOnce({ data: mockPR })

      const result = await client.getPullRequest(123)

      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}',
        {
          owner: 'test-owner',
          repo: 'test-repo',
          pull_number: 123
        }
      )
      expect(result).toEqual(mockPR)
    })

    it('should handle PR fetch errors', async () => {
      mockOctokit.request.mockRejectedValueOnce(new Error('PR not found'))

      const result = await client.getPullRequest(123)

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to get PR 123: PR not found'
      )
    })

    it('should get pull request files successfully', async () => {
      const mockFiles = [
        {
          filename: 'src/main.js',
          additions: 10,
          deletions: 5,
          status: 'modified'
        }
      ]

      mockOctokit.request.mockResolvedValueOnce({ data: mockFiles })

      const result = await client.getPullRequestFiles(123)

      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner: 'test-owner',
          repo: 'test-repo',
          pull_number: 123
        }
      )
      expect(result).toEqual(mockFiles)
    })

    it('should handle PR files fetch errors', async () => {
      mockOctokit.request.mockRejectedValueOnce(new Error('Files not found'))

      const result = await client.getPullRequestFiles(123)

      expect(result).toEqual([])
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to get PR files 123: Files not found'
      )
    })

    it('should create PR comment successfully', async () => {
      const mockComment = { id: 456, body: 'Test comment' }
      mockOctokit.request.mockResolvedValueOnce({ data: mockComment })

      const result = await client.createPRComment(123, 'Test comment')

      expect(mockOctokit.request).toHaveBeenCalledWith(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
        {
          owner: 'test-owner',
          repo: 'test-repo',
          issue_number: 123,
          body: 'Test comment'
        }
      )
      expect(result).toEqual(mockComment)
    })

    it('should handle PR comment creation errors', async () => {
      mockOctokit.request.mockRejectedValueOnce(new Error('Comment failed'))

      const result = await client.createPRComment(123, 'Test comment')

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to create PR comment 123: Comment failed'
      )
    })

    it('should add PR label successfully', async () => {
      mockOctokit.request.mockResolvedValueOnce({ data: {} })

      const result = await client.addPRLabel(123, 'size/m')

      expect(mockOctokit.request).toHaveBeenCalledWith(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
        {
          owner: 'test-owner',
          repo: 'test-repo',
          issue_number: 123,
          labels: ['size/m']
        }
      )
      expect(result).toBe(true)
    })

    it('should handle PR label addition errors', async () => {
      mockOctokit.request.mockRejectedValueOnce(new Error('Label failed'))

      const result = await client.addPRLabel(123, 'size/m')

      expect(result).toBe(false)
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to add PR label 123: Label failed'
      )
    })

    it('should get pull request commits successfully', async () => {
      const mockCommits = [
        { sha: 'commit1', commit: { message: 'First commit' } },
        { sha: 'commit2', commit: { message: 'Second commit' } }
      ]

      mockOctokit.request.mockResolvedValueOnce({ data: mockCommits })

      const result = await client.getPullRequestCommits(123)

      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
        {
          owner: 'test-owner',
          repo: 'test-repo',
          pull_number: 123
        }
      )
      expect(result).toEqual(mockCommits)
    })

    it('should handle PR commits fetch errors', async () => {
      mockOctokit.request.mockRejectedValueOnce(new Error('Commits failed'))

      const result = await client.getPullRequestCommits(123)

      expect(result).toEqual([])
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to get PR commits 123: Commits failed'
      )
    })

    it('should compare commits diff successfully', async () => {
      const mockComparison = {
        files: [
          {
            filename: 'src/file1.js',
            additions: 10,
            deletions: 5
          }
        ]
      }

      mockOctokit.request.mockResolvedValueOnce({ data: mockComparison })

      const result = await client.compareCommitsDiff('base-sha', 'head-sha')

      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/compare/{base}...{head}',
        {
          owner: 'test-owner',
          repo: 'test-repo',
          base: 'base-sha',
          head: 'head-sha'
        }
      )
      expect(result).toEqual(mockComparison)
    })

    it('should handle commits diff comparison errors', async () => {
      mockOctokit.request.mockRejectedValueOnce(new Error('Compare failed'))

      const result = await client.compareCommitsDiff('base-sha', 'head-sha')

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to compare commits base-sha...head-sha: Compare failed'
      )
    })
  })
})
