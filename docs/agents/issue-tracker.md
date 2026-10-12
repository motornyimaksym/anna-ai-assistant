# Issue tracker: GitHub

Project issues and specs live in GitHub Issues for `motornyimaksym/anna-ai-assistant`. Use the `gh` CLI for tracker operations. Infer the repository from the configured `origin` remote.

## Conventions

- Create issues with `gh issue create --title "..." --body "..."`.
- Read issues with `gh issue view <number> --json number,title,body,labels,comments`.
- List open issues with `gh issue list --state open --json number,title,body,labels,comments` and add relevant label/state filters.
- Apply or remove labels with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Comment or close issues only when the task explicitly calls for that action.
- Pull requests are not a triage request surface.

When a skill says to publish work to the issue tracker, create a GitHub issue. When it says to fetch a ticket, read the corresponding issue.
