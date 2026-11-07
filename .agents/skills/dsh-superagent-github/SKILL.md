---
name: dsh-superagent-github
description: Read GitHub issues, pull requests, reviews and CI using gh. Part of the DeepSeek Superagent prototype.
---

# dsh-superagent GitHub Integration

Workers use `gh` for repository context when needed: `github/issues/<number>` or `github/pulls/<number>` for the description; `github/issues/<number>/comments` for conversation comments; `github/pulls/<number>/comments` for review comments; `github/pulls/<number>/checks` for CI.

## Guidelines
1. Before substantial work on a new human request or review comment, acknowledge the original trigger ID with a brief request-specific note.
2. For review comments, read `github/pulls/<PR>/comments`. When the outcome requires a reply, post via GitHub API or CLI.
3. Keep progress internal until work is verified and ready for human review.

