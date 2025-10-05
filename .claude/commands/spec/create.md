# Create a main spec file from an input prompt

> Follow the instructions precisely. If it wasn't specified, don't do it.

## Command syntax

/spec:create [prompt]

## RUN the following commands:

`eza . --tree --git-ignore`

`npx repomix --include "README.md,package.json,ai_docs/code_guidelines.md,ai_docs/mcp_tools_guide.md" --stdout --output-show-line-numbers --no-file-summary --no-gitignore`

## CHECK serena onboarding

Check if serena onboarding has been executed

## Instructions

1. Read the prompt
2. Figure out the `main-spec-title` name
3. Search for relevant PRs and commits to get more context about this requirement.
4. Search for relevant files in the codebase.
5. Create the spec file `specs/[main-spec-title]/spec.md`
