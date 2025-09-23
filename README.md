# Agile Metrics Action

[![GitHub Super-Linter](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that collects key agile and DevOps metrics from your repository,
including:

- **Deployment Frequency**: How often deployments are made to production
- **Lead Time for Change**: Time from commit to deployment

## Features

- 🚀 **Automatic Detection**: Prioritizes GitHub releases over tags for metrics
  calculation
- 📊 **Comprehensive Metrics**: Calculates average, oldest, and newest lead
  times
- 🔧 **Configurable**: Supports various options for different workflows
- 📝 **Rich Output**: Provides JSON data, individual metrics, and Markdown
  summaries
- 🔄 **Git Integration**: Optionally commits metrics back to the repository
- ⚡ **Fast & Reliable**: Built with robust error handling and performance
  optimization

## Usage

### Basic Usage

```yaml
name: Collect Metrics

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9 AM UTC
  workflow_dispatch:

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect Agile Metrics
        uses: xavius-rb/agile-metrics-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Configuration

```yaml
- name: Collect Agile Metrics
  id: metrics
  uses: xavius-rb/agile-metrics-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    output-path: 'reports/metrics.json'
    commit-results: 'false'
    include-merge-commits: 'true'
    max-releases: '50'
    max-tags: '100'

- name: Use Metrics
  run: |
    echo "Deployment frequency: ${{ steps.metrics.outputs.deployment-frequency }} days"
    echo "Average lead time: ${{ steps.metrics.outputs.lead-time-avg }} hours"
```

## Inputs

| Input                   | Description                                                | Required | Default                         |
| ----------------------- | ---------------------------------------------------------- | -------- | ------------------------------- |
| `github-token`          | GitHub token for API access                                | ✅       | `${{ github.token }}`           |
| `output-path`           | Path where metrics JSON file will be saved                 | ❌       | `metrics/delivery_metrics.json` |
| `commit-results`        | Whether to commit the metrics file back to the repository  | ❌       | `true`                          |
| `include-merge-commits` | Whether to include merge commits in lead time calculations | ❌       | `false`                         |
| `max-releases`          | Maximum number of releases to fetch for analysis           | ❌       | `100`                           |
| `max-tags`              | Maximum number of tags to fetch if no releases are found   | ❌       | `100`                           |

## Outputs

| Output                 | Description                                 |
| ---------------------- | ------------------------------------------- |
| `metrics-json`         | Complete metrics data as JSON string        |
| `deployment-frequency` | Days between latest and previous deployment |
| `lead-time-avg`        | Average lead time for change in hours       |
| `lead-time-oldest`     | Oldest commit lead time in hours            |
| `lead-time-newest`     | Newest commit lead time in hours            |
| `commit-count`         | Number of commits analyzed                  |
| `metrics-file-path`    | Path to the generated metrics file          |

## Metrics Explained

### Deployment Frequency

Measures how often your team deploys code to production. Calculated as the time
difference between consecutive releases or tags.

- **Elite**: On-demand (multiple deployments per day)
- **High**: Between once per day and once per week
- **Medium**: Between once per week and once per month
- **Low**: Fewer than once per month

### Lead Time for Change

Measures the time from when code is committed to when it's successfully running
in production.

- **Average**: Mean time across all commits in the release
- **Oldest**: The commit that took the longest time to deploy
- **Newest**: The most recent commit (excludes merge commits by default)

The action analyzes commits between releases/tags and calculates the time from
commit timestamp to release timestamp.

## How It Works

1. **Data Source Detection**: The action first looks for GitHub releases, then
   falls back to tags if no releases are found
2. **Release Analysis**: Compares the latest and previous releases/tags to
   calculate deployment frequency
3. **Commit Analysis**: Examines all commits between releases to calculate lead
   time metrics
4. **Output Generation**: Creates JSON file, sets GitHub Actions outputs, and
   generates markdown summary
5. **Optional Commit**: Can commit the metrics file back to the repository for
   tracking over time

## Output Format

The action generates a comprehensive JSON file with the following structure:

```json
{
  "generated_at": "2023-01-01T12:00:00.000Z",
  "repo": "owner/repo",
  "source": "release",
  "latest": {
    "name": "v2.0.0",
    "tag": "v2.0.0",
    "sha": "abc123",
    "created_at": "2023-01-01T12:00:00.000Z"
  },
  "previous": {
    "name": "v1.0.0",
    "tag": "v1.0.0",
    "sha": "def456",
    "created_at": "2022-12-25T12:00:00.000Z"
  },
  "metrics": {
    "deployment_frequency_days": 7,
    "lead_time_for_change": {
      "commit_count": 15,
      "avg_hours": 24.5,
      "oldest_hours": 72.0,
      "newest_hours": 2.5,
      "oldest_commit_sha": "old123",
      "newest_commit_sha": "new456",
      "newest_excludes_merges": true
    }
  }
}
```

## Contributing

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Bundle the action: `npm run bundle`
4. Create a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
