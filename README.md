# Agile Metrics Action

[![GitHub Super-Linter](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/xavius-rb/agile-metrics-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that collects key agile and DevOps metrics from your repository,
including:

**DORA Metrics:**

- **Deployment Frequency**: How often deployments are made to production
- **Lead Time for Change**: Time from commit to deployment

**DevEx Metrics:**

- **PR Size**: Automatic categorization of pull request size with labels and
  comments
- **PR Maturity**: Ratio of stable code vs changes made after PR publication

## Features

**DORA Metrics:**

- 🚀 **Automatic Detection**: Prioritizes GitHub releases over tags for metrics
  calculation
- 📊 **Comprehensive Metrics**: Calculates average, oldest, and newest lead
  times
- 🔧 **Configurable**: Supports various options for different workflows

**DevEx Metrics:**

- 🏷️ **PR Size Labeling**: Automatically adds size labels (size/xs, size/s,
  size/m, size/l, size/xl)
- 💬 **PR Comments**: Adds informative comments with detailed size breakdown
- 🎯 **PR Maturity Analysis**: Measures code stability after PR publication
- 🔍 **Smart Filtering**: Ignore specific files, line deletions, or file
  deletions
- 📐 **Flexible Sizing**: Configurable thresholds for different project needs

**General:**

- �📝 **Rich Output**: Provides JSON data, individual metrics, and Markdown
  summaries
- 🔄 **Git Integration**: Optionally commits metrics back to the repository
- ⚡ **Fast & Reliable**: Built with robust error handling and performance
  optimization
- 🔀 **Independent Metrics**: DORA and DevEx metrics can be enabled separately

## Usage

### Basic Usage

#### DORA Metrics (Deployment & Lead Time)

```yaml
name: Collect DORA Metrics

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9 AM UTC
  workflow_dispatch:

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect DORA Metrics
        uses: xavius-rb/agile-metrics-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          enable-dora-metrics: 'true'
          enable-devex-metrics: 'false'
```

#### DevEx Metrics (PR Size Analysis)

```yaml
name: PR Size Analysis

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  pr-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Analyze PR Size
        uses: xavius-rb/agile-metrics-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          enable-dora-metrics: 'false'
          enable-devex-metrics: 'true'
          files-to-ignore: '*.md,*.txt,package-lock.json'
          ignore-line-deletions: 'false'
```

### Advanced Configuration

#### Combined DORA and DevEx Metrics

```yaml
- name: Collect All Metrics
  id: metrics
  uses: xavius-rb/agile-metrics-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

    # Output configuration
    output-path: 'reports/metrics.json'
    commit-results: 'false'

    # Enable both metric types
    enable-dora-metrics: 'true'
    enable-devex-metrics: 'true'

    # DORA configuration
    include-merge-commits: 'true'
    max-releases: '50'
    max-tags: '100'

    # DevEx configuration
    files-to-ignore: '*.md,*.txt,package-lock.json,yarn.lock'
    ignore-line-deletions: 'false'
    ignore-file-deletions: 'true'

- name: Use Metrics
  run: |
    echo "Deployment frequency: ${{ steps.metrics.outputs.deployment-frequency }} days"
    echo "Average lead time: ${{ steps.metrics.outputs.lead-time-avg }} hours"
    echo "PR size: ${{ steps.metrics.outputs.pr-size }}"
```

## Inputs

### General Inputs

| Input                  | Description                                               | Required | Default                         |
| ---------------------- | --------------------------------------------------------- | -------- | ------------------------------- |
| `github-token`         | GitHub token for API access                               | ✅       | `${{ github.token }}`           |
| `output-path`          | Path where metrics JSON file will be saved                | ❌       | `metrics/delivery_metrics.json` |
| `commit-results`       | Whether to commit the metrics file back to the repository | ❌       | `true`                          |
| `enable-dora-metrics`  | Whether to enable DORA metrics collection                 | ❌       | `true`                          |
| `enable-devex-metrics` | Whether to enable DevEx metrics collection                | ❌       | `false`                         |

### DORA Metrics Inputs

| Input                   | Description                                                | Required | Default |
| ----------------------- | ---------------------------------------------------------- | -------- | ------- |
| `include-merge-commits` | Whether to include merge commits in lead time calculations | ❌       | `false` |
| `max-releases`          | Maximum number of releases to fetch for analysis           | ❌       | `100`   |
| `max-tags`              | Maximum number of tags to fetch if no releases are found   | ❌       | `100`   |

### DevEx Metrics Inputs

| Input                   | Description                                                 | Required | Default |
| ----------------------- | ----------------------------------------------------------- | -------- | ------- |
| `files-to-ignore`       | Comma-separated list of file patterns to ignore for PR size | ❌       | `""`    |
| `ignore-line-deletions` | Whether to ignore line deletions when calculating PR size   | ❌       | `false` |
| `ignore-file-deletions` | Whether to ignore file deletions when calculating PR size   | ❌       | `false` |

## Outputs

### General Outputs

| Output              | Description                          |
| ------------------- | ------------------------------------ |
| `metrics-json`      | Complete metrics data as JSON string |
| `metrics-file-path` | Path to the generated metrics file   |

### DORA Metrics Outputs

| Output                 | Description                                 |
| ---------------------- | ------------------------------------------- |
| `deployment-frequency` | Days between latest and previous deployment |
| `lead-time-avg`        | Average lead time for change in hours       |
| `lead-time-oldest`     | Oldest commit lead time in hours            |
| `lead-time-newest`     | Newest commit lead time in hours            |
| `commit-count`         | Number of commits analyzed                  |

### DevEx Metrics Outputs

| Output                   | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `pr-size`                | PR size category (xs, s, m, l, xl)                |
| `pr-size-category`       | PR size category with prefix (size/xs, size/s...) |
| `pr-size-details`        | Detailed PR size metrics as JSON string           |
| `pr-maturity-ratio`      | PR maturity ratio (0.0 to 1.0)                    |
| `pr-maturity-percentage` | PR maturity percentage (0 to 100)                 |
| `pr-maturity-details`    | Detailed PR maturity metrics as JSON string       |

## Metrics Explained

### DORA Metrics

#### Deployment Frequency

Measures how often your team deploys code to production. Calculated as the time
difference between consecutive releases or tags.

#### Lead Time for Change

Time from when a commit is made to when it's deployed to production. Helps
identify bottlenecks in your delivery pipeline.

### DevEx Metrics

#### PR Size

Automatically categorizes pull requests based on the total number of changes
(additions + deletions):

- **XS (🤏)**: ≤ 10 changes - Quick fixes, small tweaks
- **S (🔹)**: 11-50 changes - Small features, bug fixes
- **M (🔸)**: 51-200 changes - Medium features, refactoring
- **L (🔶)**: 201-500 changes - Large features, significant changes
- **XL (🔥)**: > 500 changes - Major refactoring, multiple features

**Benefits:**

- Encourages smaller, more reviewable PRs
- Provides visibility into PR complexity
- Helps with review planning and resource allocation
- Supports better development practices

**Filtering Options:**

- `files-to-ignore`: Skip files that don't impact complexity (e.g., `*.md`,
  `package-lock.json`)
- `ignore-line-deletions`: Focus only on additions when appropriate
- `ignore-file-deletions`: Exclude deleted files from size calculation

#### PR Maturity

Measures the stability of code when a pull request is initially published by
calculating the ratio between stable changes (initial commit) and total changes
added after publication.

**Calculation:**

- **Maturity Ratio**: `stable_changes / total_changes`
- **Maturity Percentage**: Ratio converted to percentage (0-100%)

**Maturity Levels:**

- **🎯 Excellent (90-100%)**: Highly stable, minimal changes after publication
- **✅ Good (75-89%)**: Generally stable with minor adjustments
- **⚠️ Moderate (50-74%)**: Some instability, moderate changes after publication
- **🚧 Poor (25-49%)**: Significant changes after publication
- **❌ Very Poor (0-24%)**: Major instability, extensive changes after
  publication

**Benefits:**

- Encourages better preparation before PR publication
- Identifies patterns of incomplete or rushed development
- Helps teams improve their development workflow
- Provides insights into code quality and review processes

**Use Cases:**

- Track improvement in development practices over time
- Identify developers who might need additional support
- Measure the effectiveness of code review processes
- Monitor the stability of feature development

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
