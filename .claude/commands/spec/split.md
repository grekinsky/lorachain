# Split a spec file into minor specs of 1hr each

> Follow the instructions precisely. If it wasn't specified, don't do it.

## Command syntax

/spec:split [main-spec-path]/spec.md

## RUN the following commands:

`eza . --tree --git-ignore`

`npx repomix --include "README.md,package.json,ai_docs/code_guidelines.md,ai_docs/mcp_tools_guide.md" --stdout --output-show-line-numbers --no-file-summary --no-gitignore`

## CHECK serena onboarding

Check if serena onboarding has been executed

## READ the main spec file:

`[main-spec-path]/spec.md`

## Instructions

Split the main spec file in several spec files based on the time to spend in the task.

Each spec should take 1 hour to finish, so, if the whole spec takes 8 hours to finish, it should be split in around 8 specs. All the specs should be named `0-spec.md` and placed in its own folder within [main-spec-path], for instance, the spec files should be in `[main-spec-path]/[spec-#-title]/0-spec.md`.

Each spec segment should be elaborated accordingly, avoiding to work in tasks from the other specs but keeping them in in context so every task is aware of each other and the main goal.
