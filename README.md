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

**Team Metrics:**

- **Pickup Time**: Time from PR creation to first review
- **Approve Time**: Time from first comment to approval
- **Merge Time**: Time from approval to merge
- **Merge Frequency**: Number of PRs merged per developer per week

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

**Team Metrics:**

- 📊 **Aggregate Analytics**: Team-wide metrics across multiple PRs over time
- ⏱️ **Time Tracking**: Pickup, approve, and merge time measurements
- 🚀 **Velocity Insights**: Merge frequency per developer metrics
- 📈 **Trend Analysis**: Weekly, fortnightly, or monthly reporting periods
- 🎯 **Performance Ratings**: Elite/Good/Fair/Needs Focus classifications
- 📝 **Rich Reports**: Markdown reports with statistics and visualizations

**General:**

- 📝 **Rich Output**: Provides JSON data, individual metrics, and Markdown
  summaries
- 🔄 **Git Integration**: Optionally commits metrics back to the repository
- ⚡ **Fast & Reliable**: Built with robust error handling and performance
  optimization
- 🔀 **Independent Metrics**: Each metric can be enabled/disabled individually
  for maximum flexibility

## Usage

### Basic Usage

#### Deployment Frequency Metric

```yaml
name: Collect Deployment Frequency

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9 AM UTC
  workflow_dispatch:

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect Deployment Frequency
        uses: xavius-rb/agile-metrics-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          deployment-frequency: 'true'
```

#### Lead Time Metric

```yaml
name: Collect Lead Time

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9 AM UTC
  workflow_dispatch:

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect Lead Time
        uses: xavius-rb/agile-metrics-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          lead-time: 'true'
```

#### PR Size Analysis

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
        uses: xavius-rb/agile-metrics-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pr-size: 'true'
          files-to-ignore: '*.md,*.txt,package-lock.json'
          ignore-line-deletions: 'false'
```

#### PR Maturity Analysis

```yaml
name: PR Maturity Analysis

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  pr-maturity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Analyze PR Maturity
        uses: xavius-rb/agile-metrics-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pr-maturity: 'true'
```

### Advanced Configuration

#### Team Metrics

```yaml
name: Collect Team Metrics

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9 AM UTC
  workflow_dispatch:

jobs:
  team-metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect Team Metrics
        uses: xavius-rb/agile-metrics-action@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          team-metrics: 'true'
          time-period: 'weekly' # Options: weekly, fortnightly, monthly
          team-metrics-output-path: 'reports/team_metrics.md'
```

#### Combined Metrics

```yaml
- name: Collect All Metrics
  id: metrics
  uses: xavius-rb/agile-metrics-action@v2
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

    # Output configuration
    output-path: 'reports/metrics.json'
    commit-results: 'false'

    # Enable specific metrics
    deployment-frequency: 'true'
    lead-time: 'true'
    pr-size: 'true'
    pr-maturity: 'true'

    # DORA configuration (applies to deployment-frequency and lead-time)
    include-merge-commits: 'true'
    max-releases: '50'
    max-tags: '100'

    # DevEx configuration (applies to pr-size and pr-maturity)
    files-to-ignore: '*.md,*.txt,package-lock.json,yarn.lock'
    ignore-line-deletions: 'false'
    ignore-file-deletions: 'true'

- name: Use Metrics
  run: |
    echo "Deployment frequency: \
      ${{ steps.metrics.outputs.deployment-frequency }} days"
    echo "Average lead time: ${{ steps.metrics.outputs.lead-time-avg }} hours"
    echo "PR size: ${{ steps.metrics.outputs.pr-size }}"
    echo "PR maturity: ${{ steps.metrics.outputs.pr-maturity-percentage }}%"
```

## Inputs

### General Inputs

| Input            | Description                                               | Required | Default                         |
| ---------------- | --------------------------------------------------------- | -------- | ------------------------------- |
| `github-token`   | GitHub token for API access                               | ✅       | `${{ github.token }}`           |
| `output-path`    | Path where metrics JSON file will be saved                | ❌       | `metrics/delivery_metrics.json` |
| `commit-results` | Whether to commit the metrics file back to the repository | ❌       | `true`                          |

### Metric-Specific Inputs

| Input                  | Description                                   | Required | Default |
| ---------------------- | --------------------------------------------- | -------- | ------- |
| `deployment-frequency` | Whether to enable deployment frequency metric | ❌       | `false` |
| `lead-time`            | Whether to enable lead time for change metric | ❌       | `false` |
| `pr-size`              | Whether to enable PR size metric              | ❌       | `false` |
| `pr-maturity`          | Whether to enable PR maturity metric          | ❌       | `false` |
| `team-metrics`         | Whether to enable team metrics                | ❌       | `false` |

### Team Metrics Configuration

Applies to `team-metrics` metric.

| Input                      | Description                                             | Required | Default                          |
| -------------------------- | ------------------------------------------------------- | -------- | -------------------------------- |
| `time-period`              | Time period for analysis (weekly, fortnightly, monthly) | ❌       | `weekly`                         |
| `team-metrics-output-path` | Path where team metrics markdown report will be saved   | ❌       | `metrics/team_metrics_report.md` |

### DORA Metrics Configuration

Applies to `deployment-frequency` and `lead-time` metrics.

| Input                   | Description                                                | Required | Default |
| ----------------------- | ---------------------------------------------------------- | -------- | ------- |
| `include-merge-commits` | Whether to include merge commits in lead time calculations | ❌       | `false` |
| `max-releases`          | Maximum number of releases to fetch for analysis           | ❌       | `100`   |
| `max-tags`              | Maximum number of tags to fetch if no releases are found   | ❌       | `100`   |

### DevEx Metrics Configuration

Applies to `pr-size` and `pr-maturity` metrics.

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

### Team Metrics Outputs

| Output                     | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `team-metrics-json`        | Complete team metrics data as JSON string        |
| `team-metrics-report-path` | Path to the generated team metrics markdown file |

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

- **S (🔹)**: < 105 changes - Small features, bug fixes
- **M (🔸)**: 106-160 changes - Medium features, refactoring
- **L (🔶)**: 161-240 changes - Large features, significant changes
- **XL (🔥)**: > 240 changes - Major refactoring, multiple features

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

- **⭐ Elite (>88%)**: Highest stability, minimal changes after publication
- **✅ Good (81-87%)**: Strong stability with minor adjustments
- **⚖️ Fair (75-80%)**: Moderate stability, some adjustments needed
- **🎯 Needs Focus (<75%)**: Significant changes after publication

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

#### Team Metrics

Team metrics provide aggregated insights across multiple PRs over a specified
time period, helping teams understand their development velocity and quality
patterns.

**Metrics Collected:**

- **Pickup Time**: Time from PR creation to first review activity
- **Approve Time**: Time from first comment to first approval
- **Merge Time**: Time from first approval to merge
- **Merge Frequency**: Number of merged PRs per developer per week

**Time Periods:**

- **Weekly**: Last 7 days
- **Fortnightly**: Last 14 days
- **Monthly**: Last 30 days

**Rating Levels:**

All time-based metrics are rated on the same 4-level scale:

| Level              | Pickup Time | Approve Time | Merge Time | Merge Frequency      |
| ------------------ | ----------- | ------------ | ---------- | -------------------- |
| ⭐ **Elite**       | < 2 hours   | < 17 hours   | < 2 hours  | > 1.6 PRs/dev/week   |
| ✅ **Good**        | 2-6 hours   | 17-24 hours  | 2-5 hours  | 1.1-1.6 PRs/dev/week |
| ⚖️ **Fair**        | 7-16 hours  | 25-45 hours  | 6-19 hours | 0.6-1.0 PRs/dev/week |
| 🎯 **Needs Focus** | > 16 hours  | > 45 hours   | > 19 hours | < 0.6 PRs/dev/week   |

**Outputs:**

- JSON data with all metrics and per-PR details
- Markdown report with statistics and ratings
- GitHub Actions summary for immediate visibility

**Benefits:**

- Identifies bottlenecks in the review process
- Tracks team velocity and throughput
- Measures code review effectiveness
- Highlights areas for process improvement
- Provides data-driven insights for retrospectives

## How It Works

1. **Data Source Detection**: The action first looks for GitHub releases, then
   falls back to tags if no releases are found
1. **Release Analysis**: Compares the latest and previous releases/tags to
   calculate deployment frequency
1. **Commit Analysis**: Examines all commits between releases to calculate lead
   time metrics
1. **Output Generation**: Creates JSON file, sets GitHub Actions outputs, and
   generates markdown summary
1. **Optional Commit**: Can commit the metrics file back to the repository for
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
1. Run tests: `npm test`
1. Bundle the action: `npm run bundle`
1. Create a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Migration Guide

### Upgrading from v1 to v2

Version 2.0.0 introduces a **breaking change** in how metrics are enabled. The
high-level `enable-dora-metrics` and `enable-devex-metrics` inputs have been
replaced with individual metric toggles.

#### v1.x Configuration

```yaml
- uses: xavius-rb/agile-metrics-action@v1
  with:
    enable-dora-metrics: 'true'
    enable-devex-metrics: 'true'
```

#### v2.x Configuration

```yaml
- uses: xavius-rb/agile-metrics-action@v2
  with:
    deployment-frequency: 'true'
    lead-time: 'true'
    pr-size: 'true'
    pr-maturity: 'true'
```

**Key Changes:**

1. `enable-dora-metrics: 'true'` → `deployment-frequency: 'true'` +
   `lead-time: 'true'`
1. `enable-devex-metrics: 'true'` → `pr-size: 'true'` + `pr-maturity: 'true'`
1. By default, **all metrics are now disabled** (changed from v1 where DORA
   metrics were enabled by default)
1. You must explicitly enable each metric you want to collect

**Benefits:**

1. Fine-grained control over which metrics to collect
1. Reduced API calls and processing time when you only need specific metrics
1. More flexible for different use cases and workflows
