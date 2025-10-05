# Update a Spec file

## VARIABLES

SPEC_FILE: $ARGUMENTS

> Follow the instructions precisely. If it wasn't specified, don't do it.

## RUN the following commands:

`eza . --tree --git-ignore`

`npx repomix --include "README.md,package.json,ai_docs/code_guidelines.md,ai_docs/mcp_tools_guide.md,specs/ROADMAP.md" --stdout --output-show-line-numbers --no-file-summary --no-gitignore`

## CHECK serena onboarding

Check if serena onboarding has been executed

## INSTRUCTIONS

Update the spec file SPEC_FILE taking into account:

- The current state of the project.
- The recent changes.
- It's explicitly defined to **NOT to support legacy code, allowing for breaking changes**.
