# verify-pr-action

This action verifies PR titles and descriptions.

## Inputs

### `titleRegex`

**Required** Regex to be run on the PR title

### `titleMinLength`

**Required** Minimum length for PR title

### `descriptionRegex`

**Required** Regex to be run on the PR description

### `descriptionMinLength`

**Required** Minimum length for PR description

## Example usage

```yaml
uses: actions/verify-pr-action
with:
  titleRegex: "Title.+"
  titleMinLength: 10
  descriptionRegex: "Description.+"
  descriptionMinLength: 50
```
