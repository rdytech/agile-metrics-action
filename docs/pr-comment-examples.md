# PR Comment Examples

This document shows examples of what the automated PR comments will look like
when both PR Size and PR Maturity metrics are available.

## Example 1: Medium PR with Excellent Maturity

```markdown
## 🔸 PR Size: M

This pull request has been automatically categorized as **m** based on the
following metrics:

- **Lines added:** 85
- **Lines removed:** 23
- **Total changes:** 108
- **Files changed:** 7

## 🎯 PR Maturity: 95%

This pull request has a **Excellent** maturity rating based on code stability:

- **Maturity ratio:** 0.95
- **Total commits:** 2
- **Stable changes:** 103
- **Changes after publication:** 5

_This comment was generated automatically by the Agile Metrics Action._
```

## Example 2: Large PR with Poor Maturity

```markdown
## 🔶 PR Size: L

This pull request has been automatically categorized as **l** based on the
following metrics:

- **Lines added:** 320
- **Lines removed:** 45
- **Total changes:** 365
- **Files changed:** 12

## 🚧 PR Maturity: 35%

This pull request has a **Poor** maturity rating based on code stability:

- **Maturity ratio:** 0.35
- **Total commits:** 8
- **Stable changes:** 128
- **Changes after publication:** 237

_This comment was generated automatically by the Agile Metrics Action._
```

## Example 3: Small PR with Good Maturity

```markdown
## 🔹 PR Size: S

This pull request has been automatically categorized as **s** based on the
following metrics:

- **Lines added:** 28
- **Lines removed:** 12
- **Total changes:** 40
- **Files changed:** 3

## ✅ PR Maturity: 80%

This pull request has a **Good** maturity rating based on code stability:

- **Maturity ratio:** 0.8
- **Total commits:** 3
- **Stable changes:** 32
- **Changes after publication:** 8

_This comment was generated automatically by the Agile Metrics Action._
```

## Example 4: PR Size Only (No Maturity Data)

If PR maturity cannot be calculated (e.g., API errors, single commit with no
changes), only the PR size information will be shown:

```markdown
## 🤏 PR Size: XS

This pull request has been automatically categorized as **xs** based on the
following metrics:

- **Lines added:** 5
- **Lines removed:** 2
- **Total changes:** 7
- **Files changed:** 1

_This comment was generated automatically by the Agile Metrics Action._
```

## Benefits of Combined Metrics

The combined PR comment provides valuable insights:

1. **Development Planning**: Size indicates review complexity and time
   requirements
1. **Code Quality**: Maturity reflects preparation quality and development
   practices
1. **Process Improvement**: Low maturity scores can indicate areas for developer
   coaching
1. **Team Metrics**: Track improvements in both size management and code
   stability over time

## Customization

The comment format and thresholds can be customized by:

- Modifying the emoji mappings in `getMaturityEmoji()` and `getSizeEmoji()`
- Adjusting the maturity level descriptions in `getMaturityLevel()`
- Updating the PR size thresholds in the categorization logic
- Customizing the comment template in the `addPRComment()` method
