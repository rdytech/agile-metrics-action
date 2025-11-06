# Agile Metrics Action - Design Document

## Overview

This document outlines the design for converting the delivery metrics collection
workflow from `metrics.yml` into a reusable GitHub Action. The action will
collect key agile/DevOps metrics including Deployment Frequency and Lead Time
for Change from GitHub repositories.

## Current State Analysis

The existing workflow in `metrics.yml` contains a comprehensive JavaScript
script that:

- Analyzes GitHub releases and tags to determine deployment frequency
- Calculates lead time for change by examining commits between releases
- Generates detailed metrics in JSON format
- Creates a markdown summary
- Commits results back to the repository

## Action Design

### Action Metadata (`action.yml`)

```yaml
name: 'Agile Metrics Collector'
description:
  'Collect deployment frequency and lead time for change metrics from GitHub
  repositories'
author: 'xavius-rb'

branding:
  icon: 'trending-up'
  color: 'blue'

inputs:
  github-token:
    description: 'GitHub token for API access'
    required: true
    default: ${{ github.token }}

  output-path:
    description: 'Path where metrics JSON file will be saved'
    required: false
    default: 'metrics/delivery_metrics.json'

  commit-results:
    description: 'Whether to commit the metrics file back to the repository'
    required: false
    default: 'true'

  include-merge-commits:
    description: 'Whether to include merge commits in lead time calculations'
    required: false
    default: 'false'

  max-releases:
    description: 'Maximum number of releases to fetch for analysis'
    required: false
    default: '100'

  max-tags:
    description: 'Maximum number of tags to fetch if no releases are found'
    required: false
    default: '100'

outputs:
  metrics-json:
    description: 'Complete metrics data as JSON string'

  deployment-frequency:
    description: 'Days between latest and previous deployment'

  lead-time-avg:
    description: 'Average lead time for change in hours'

  lead-time-oldest:
    description: 'Oldest commit lead time in hours'

  lead-time-newest:
    description: 'Newest commit lead time in hours'

  commit-count:
    description: 'Number of commits analyzed'

  metrics-file-path:
    description: 'Path to the generated metrics file'

runs:
  using: node24
  main: dist/index.js
```

### Source Code Structure

#### `src/main.js` - Entry Point

- Parse inputs
- Initialize GitHub client
- Orchestrate the metrics collection process
- Handle outputs and error cases

#### `src/metrics-collector.js` - Core Metrics Logic

Main class responsible for:

- Repository analysis (releases vs tags)
- Deployment frequency calculation
- Lead time for change calculation
- Data aggregation and formatting

#### `src/github-client.js` - GitHub API Wrapper

Abstraction layer for GitHub API calls:

- Release fetching
- Tag resolution
- Commit comparison
- Error handling and retries

#### `src/utils.js` - Utility Functions

Helper functions for:

- Date/time calculations
- Data formatting
- File system operations
- Validation

#### `src/outputs.js` - Output Management

- JSON file generation
- Markdown summary creation
- GitHub Actions outputs
- Git operations (commit/push)

### Key Features

#### 1. Flexible Data Source Detection

- Prioritize GitHub releases over tags
- Automatic fallback to tags if no releases exist
- Support for both annotated and lightweight tags

#### 2. Comprehensive Metrics Calculation

**Deployment Frequency:**

- Time between consecutive releases/tags
- Configurable to use different date sources (creation vs commit time)

**Lead Time for Change:**

- Average, oldest, and newest commit lead times
- Exclude merge commits from "newest" calculation (configurable)
- Detailed commit analysis with SHA references

#### 3. Robust Error Handling

- Graceful degradation when data is unavailable
- Comprehensive logging and warnings
- Validation of inputs and intermediate results

#### 4. Output Flexibility

- JSON file output for machine consumption
- Markdown summary for human readability
- Individual metric outputs for workflow integration
- Optional Git commit functionality

### Implementation Plan

#### Phase 1: Core Infrastructure

1. Set up basic action structure with proper inputs/outputs
1. Implement GitHub API client with authentication
1. Create utility functions for date/time operations
1. Set up comprehensive error handling

#### Phase 2: Metrics Collection

1. Implement release/tag detection and prioritization
1. Build deployment frequency calculation
1. Develop lead time for change logic
1. Add commit analysis with merge detection

#### Phase 3: Output Generation

1. Create JSON output formatting
1. Implement Markdown summary generation
1. Add file system operations
1. Integrate Git commit functionality

#### Phase 4: Testing & Validation

1. Unit tests for all core functions
1. Integration tests with mock GitHub data
1. End-to-end testing with real repositories
1. Performance optimization

### Configuration Examples

#### Basic Usage

```yaml
- name: Collect Metrics
  uses: xavius-rb/agile-metrics-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Advanced Configuration

```yaml
- name: Collect Metrics
  uses: xavius-rb/agile-metrics-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    output-path: 'reports/metrics.json'
    commit-results: 'false'
    include-merge-commits: 'true'
    max-releases: '50'
```

#### With Custom Workflow

```yaml
- name: Collect Metrics
  id: metrics
  uses: xavius-rb/agile-metrics-action@v1

- name: Upload to Analytics
  run: |
    echo "Deployment frequency: \
      ${{ steps.metrics.outputs.deployment-frequency }} days"
    echo "Average lead time: ${{ steps.metrics.outputs.lead-time-avg }} hours"
    curl -X POST $ANALYTICS_URL \
      -d '${{ steps.metrics.outputs.metrics-json }}'
```

### Technical Considerations

#### Dependencies

- `@actions/core` - GitHub Actions toolkit
- `@actions/github` - GitHub API client
- `@actions/exec` - For Git operations
- Native Node.js modules for file operations

#### Performance

- Implement pagination for large repositories
- Add caching for tag resolution
- Optimize API calls with parallel requests where possible

#### Security

- Validate all user inputs
- Sanitize file paths
- Use official GitHub token for authentication
- No sensitive data in logs

#### Backward Compatibility

- Maintain output format compatibility with existing workflow
- Support both release and tag-based workflows
- Preserve existing metric calculation methods

### Testing Strategy

#### Unit Tests

- Individual function testing with mocked dependencies
- Edge case validation (no releases, single release, etc.)
- Date calculation accuracy
- Error handling scenarios

#### Integration Tests

- Mock GitHub API responses
- Test complete workflow scenarios
- Validate output formats
- Git operations testing

#### End-to-End Tests

- Real repository testing
- Performance benchmarking
- Cross-platform compatibility
- Different repository configurations

### Migration Path

#### For Existing Users

1. Replace workflow step with action usage
1. Map existing outputs to new action outputs
1. Update any dependent workflows
1. Test with existing repository configurations

#### Validation Steps

1. Compare outputs between old workflow and new action
1. Verify metric accuracy across different repository types
1. Test performance with large repositories
1. Validate error handling improvements

### Future Enhancements

#### Additional Metrics

- Mean Time to Recovery (MTTR)
- Change Failure Rate
- Code review metrics
- Sprint/iteration metrics

#### Advanced Features

- Multiple repository analysis
- Trend analysis over time
- Configurable metric definitions
- Integration with external analytics platforms

#### Performance Improvements

- Incremental updates
- Background processing
- Advanced caching strategies
- Distributed analysis for large organizations

## Conclusion

This design provides a robust foundation for converting the existing metrics
workflow into a reusable GitHub Action. The modular architecture ensures
maintainability while the comprehensive feature set addresses various use cases
and repository configurations. The implementation plan allows for incremental
development and thorough testing to ensure reliability and accuracy of the
metrics collection process.
