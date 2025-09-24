# PR Maturity Examples

This document provides examples of how the PR Maturity metric works in different
scenarios.

## How PR Maturity is Calculated

PR Maturity measures the stability of code when a pull request is initially
published by calculating the ratio between stable changes (from the initial
commit) and total changes made after publication.

**Formula:**

```
Maturity Ratio = Stable Changes / Total Changes
Maturity Percentage = Maturity Ratio × 100
```

Where:

- **Stable Changes** = Total Changes - Changes After Publication
- **Changes After Publication** = Changes made between first commit and final
  commit

## Example Scenarios

### Scenario 1: Perfect Maturity (100%)

```
Initial PR: 50 changes
Additional commits: 0 changes
Total changes: 50

Stable Changes: 50 - 0 = 50
Maturity: 50/50 = 1.0 (100%)
Rating: 🎯 Excellent
```

### Scenario 2: High Maturity (90%)

```
Initial PR: 100 changes
Additional commits: 10 changes
Total changes: 110

Stable Changes: 110 - 10 = 100
Maturity: 100/110 = 0.91 (91%)
Rating: 🎯 Excellent
```

### Scenario 3: Good Maturity (75%)

```
Initial PR: 80 changes
Additional commits: 20 changes
Total changes: 100

Stable Changes: 100 - 20 = 80
Maturity: 80/100 = 0.80 (80%)
Rating: ✅ Good
```

### Scenario 4: Poor Maturity (25%)

```
Initial PR: 50 changes
Additional commits: 150 changes
Total changes: 200

Stable Changes: 200 - 150 = 50
Maturity: 50/200 = 0.25 (25%)
Rating: 🚧 Poor
```

## Interpreting Results

### 🎯 Excellent (90-100%)

- Code was well-prepared before PR publication
- Minimal review-driven changes needed
- Strong development practices

### ✅ Good (75-89%)

- Generally stable with minor adjustments
- Good preparation with some refinements
- Healthy development process

### ⚠️ Moderate (50-74%)

- Some instability, moderate changes after publication
- May indicate rushed initial development
- Room for improvement in preparation

### 🚧 Poor (25-49%)

- Significant changes after publication
- Suggests incomplete initial development
- May need process improvements

### ❌ Very Poor (0-24%)

- Major instability, extensive changes after publication
- Indicates significant issues with development process
- Requires attention to development practices

## Best Practices

1. **Aim for >90% maturity** by thoroughly testing and reviewing code before
   creating the PR
2. **Use draft PRs** for work-in-progress to avoid penalizing maturity scores
3. **Break large features** into smaller, more manageable PRs
4. **Consider maturity trends** over time rather than individual PR scores
5. **Use maturity data** to identify areas for developer coaching and process
   improvement

## Configuration Impact

The same filtering options that apply to PR Size also affect PR Maturity
calculations:

- `files-to-ignore`: Excludes specified files from both initial and subsequent
  change calculations
- `ignore-line-deletions`: Focuses only on additions when calculating changes
- `ignore-file-deletions`: Excludes deleted files from maturity calculations

This ensures consistency between PR Size and PR Maturity metrics.
