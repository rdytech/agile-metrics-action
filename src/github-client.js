import * as core from '@actions/core'
import { getOctokit } from '@actions/github'

/**
 * GitHub API client wrapper for metrics collection
 */
export class GitHubClient {
  /**
   * Create a new GitHub client
   * @param {string} token - GitHub authentication token
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   */
  constructor(token, owner, repo) {
    this.octokit = getOctokit(token)
    this.owner = owner
    this.repo = repo
  }

  /**
   * List releases for the repository
   * @param {number} perPage - Number of releases per page
   * @returns {Promise<Array>} Array of release objects
   */
  async listReleases(perPage = 100) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/releases',
        {
          owner: this.owner,
          repo: this.repo,
          per_page: perPage
        }
      )

      return response.data
        .filter((release) => !release.draft) // ignore drafts
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    } catch (error) {
      core.warning(`Failed to fetch releases: ${error.message}`)
      return []
    }
  }

  /**
   * List tags for the repository
   * @param {number} perPage - Number of tags per page
   * @returns {Promise<Array>} Array of tag objects
   */
  async listTags(perPage = 100) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/tags',
        {
          owner: this.owner,
          repo: this.repo,
          per_page: perPage
        }
      )

      return response.data
    } catch (error) {
      core.warning(`Failed to fetch tags: ${error.message}`)
      return []
    }
  }

  /**
   * Resolve tag details including SHA and creation date
   * @param {string} tagName - Name of the tag to resolve
   * @returns {Promise<Object|null>} Tag details or null if failed
   */
  async resolveTag(tagName) {
    try {
      // Try to get the tag reference
      const refResponse = await this.octokit.request(
        'GET /repos/{owner}/{repo}/git/ref/{ref}',
        {
          owner: this.owner,
          repo: this.repo,
          ref: `tags/${tagName}`
        }
      )

      const obj = refResponse.data.object

      if (obj.type === 'tag') {
        // Annotated tag - get the tag object
        const tagResponse = await this.octokit.request(
          'GET /repos/{owner}/{repo}/git/tags/{tag_sha}',
          {
            owner: this.owner,
            repo: this.repo,
            tag_sha: obj.sha
          }
        )

        const createdAt = tagResponse.data.tagger?.date || null
        let sha = tagResponse.data.object.sha

        // If it points to another tag, follow once
        if (tagResponse.data.object.type === 'tag') {
          const tagResponse2 = await this.octokit.request(
            'GET /repos/{owner}/{repo}/git/tags/{tag_sha}',
            {
              owner: this.owner,
              repo: this.repo,
              tag_sha: tagResponse.data.object.sha
            }
          )
          sha = tagResponse2.data.object.sha
        }

        return { name: tagName, sha, created_at: createdAt }
      } else if (obj.type === 'commit') {
        // Lightweight tag - get commit details
        const commitResponse = await this.octokit.request(
          'GET /repos/{owner}/{repo}/commits/{ref}',
          {
            owner: this.owner,
            repo: this.repo,
            ref: obj.sha
          }
        )

        const createdAt =
          commitResponse.data.commit.committer?.date ||
          commitResponse.data.commit.author?.date

        return { name: tagName, sha: obj.sha, created_at: createdAt }
      }
    } catch (error) {
      core.warning(`Failed to resolve tag ${tagName}: ${error.message}`)
    }

    return null
  }

  /**
   * Compare commits between two references
   * @param {string} base - Base reference
   * @param {string} head - Head reference
   * @returns {Promise<Object>} Comparison result with commits and metadata
   */
  async compareCommits(base, head) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/compare/{base}...{head}',
        {
          owner: this.owner,
          repo: this.repo,
          base,
          head
        }
      )

      return {
        truncated: !!(
          response.data.files?.some((f) => f.status === 'removed') &&
          response.data.commits?.length < response.data.total_commits
        ), // weak signal for truncation
        commits: response.data.commits || []
      }
    } catch (error) {
      core.warning(`Compare failed (${base}...${head}): ${error.message}`)
      return { truncated: true, commits: [] }
    }
  }

  /**
   * Get a single commit by reference
   * @param {string} ref - Commit reference (SHA, branch, tag)
   * @returns {Promise<Object|null>} Commit object or null if failed
   */
  async getCommit(ref) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/commits/{ref}',
        {
          owner: this.owner,
          repo: this.repo,
          ref
        }
      )

      return response.data
    } catch (error) {
      core.warning(`Failed to get commit ${ref}: ${error.message}`)
      return null
    }
  }

  /**
   * Get pull request details
   * @param {number} prNumber - Pull request number
   * @returns {Promise<Object|null>} Pull request object or null if failed
   */
  async getPullRequest(prNumber) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}',
        {
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber
        }
      )

      return response.data
    } catch (error) {
      core.warning(`Failed to get PR ${prNumber}: ${error.message}`)
      return null
    }
  }

  /**
   * Get pull request files
   * @param {number} prNumber - Pull request number
   * @returns {Promise<Array>} Array of file objects or empty array if failed
   */
  async getPullRequestFiles(prNumber) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber
        }
      )

      return response.data
    } catch (error) {
      core.warning(`Failed to get PR files ${prNumber}: ${error.message}`)
      return []
    }
  }

  /**
   * Create a comment on a pull request
   * @param {number} prNumber - Pull request number
   * @param {string} body - Comment body
   * @returns {Promise<Object|null>} Comment object or null if failed
   */
  async createPRComment(prNumber, body) {
    try {
      const response = await this.octokit.request(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
        {
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          body
        }
      )

      return response.data
    } catch (error) {
      core.warning(`Failed to create PR comment ${prNumber}: ${error.message}`)
      return null
    }
  }

  /**
   * Add a label to a pull request
   * @param {number} prNumber - Pull request number
   * @param {string} label - Label to add
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async addPRLabel(prNumber, label) {
    try {
      await this.octokit.request(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
        {
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          labels: [label]
        }
      )

      return true
    } catch (error) {
      core.warning(`Failed to add PR label ${prNumber}: ${error.message}`)
      return false
    }
  }

  /**
   * Get commits in a pull request
   * @param {number} prNumber - Pull request number
   * @returns {Promise<Array>} Array of commit objects or empty array if failed
   */
  async getPullRequestCommits(prNumber) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
        {
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber
        }
      )

      return response.data
    } catch (error) {
      core.warning(`Failed to get PR commits ${prNumber}: ${error.message}`)
      return []
    }
  }

  /**
   * Compare two commits to get the diff
   * @param {string} base - Base commit SHA
   * @param {string} head - Head commit SHA
   * @returns {Promise<Object|null>} Comparison data or null if failed
   */
  async compareCommitsDiff(base, head) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/compare/{base}...{head}',
        {
          owner: this.owner,
          repo: this.repo,
          base,
          head
        }
      )

      return response.data
    } catch (error) {
      core.warning(
        `Failed to compare commits ${base}...${head}: ${error.message}`
      )
      return null
    }
  }

  /**
   * Get pull requests by date range
   * @param {string} since - Start date (ISO 8601 format)
   * @param {string} until - End date (ISO 8601 format)
   * @returns {Promise<Array>} Array of pull requests
   */
  async getPullRequestsByDateRange(since, until) {
    try {
      const allPRs = []
      let page = 1
      const perPage = 100

      // Fetch all PRs (we'll filter by date client-side)
      while (true) {
        const response = await this.octokit.request(
          'GET /repos/{owner}/{repo}/pulls',
          {
            owner: this.owner,
            repo: this.repo,
            state: 'all',
            sort: 'created',
            direction: 'desc',
            per_page: perPage,
            page
          }
        )

        if (response.data.length === 0) break

        // Filter PRs by date range
        const filteredPRs = response.data.filter((pr) => {
          const createdAt = new Date(pr.created_at)
          const sinceDate = new Date(since)
          const untilDate = new Date(until)
          return createdAt >= sinceDate && createdAt <= untilDate
        })

        allPRs.push(...filteredPRs)

        // If we've gone past the date range, stop
        const oldestPR = response.data[response.data.length - 1]
        if (new Date(oldestPR.created_at) < new Date(since)) break

        if (response.data.length < perPage) break
        page++
      }

      return allPRs
    } catch (error) {
      core.warning(`Failed to fetch PRs by date range: ${error.message}`)
      return []
    }
  }

  /**
   * Get pull request timeline events
   * @param {number} pullNumber - Pull request number
   * @returns {Promise<Array>} Array of timeline events
   */
  async getPullRequestTimeline(pullNumber) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/timeline',
        {
          owner: this.owner,
          repo: this.repo,
          issue_number: pullNumber,
          per_page: 100
        }
      )

      return response.data
    } catch (error) {
      core.warning(
        `Failed to fetch timeline for PR #${pullNumber}: ${error.message}`
      )
      return []
    }
  }

  /**
   * Get pull request reviews
   * @param {number} pullNumber - Pull request number
   * @returns {Promise<Array>} Array of reviews
   */
  async getPullRequestReviews(pullNumber) {
    try {
      const response = await this.octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
        {
          owner: this.owner,
          repo: this.repo,
          pull_number: pullNumber,
          per_page: 100
        }
      )

      return response.data
    } catch (error) {
      core.warning(
        `Failed to fetch reviews for PR #${pullNumber}: ${error.message}`
      )
      return []
    }
  }
}
