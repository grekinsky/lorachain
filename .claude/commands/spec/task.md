# Work on a large spec that is split into several minor spec files

> Follow the instructions precisely. If it wasn't specified, don't do it.

## Command syntax

/spec:task [main-spec-path]/spec.md

## VARIABLES

main-spec-path: $ARGUMENTS

## Pre-conditions

Follow these steps to see if the spec is already done:

1. RUN `ls [main-spec-path]/result.md` to see if the **result file** exist
2. RUN `ls [main-spec-path]/learnings.md` to see if the **learnings file** exist
3. If both the **result file** and the **learnings file** exist, do NOT continue.

## Task execution

Follow the next steps in order:

1. RUN `eza . --tree --git-ignore`

2. RUN `npx repomix --include "README.md,package.json,ai_docs/code_guidelines.md,ai_docs/mcp_tools_guide.md,[main-spec-path]/spec.md" --stdout --output-show-line-numbers --no-file-summary --no-gitignore`

3. Check if serena onboarding has been executed

4. RUN `find [main-spec-path] -type d -name "spec-*" | sort` to list all child specs

5. RUN `for dir in [main-spec-path]/spec-*/; do echo "=== $(basename $dir) ==="; if [ -f "${dir}4-learnings.md" ]; then echo "✓ Complete"; else echo "𐄂 Incomplete"; fi; done;` to find out the status of each child spec.

6. If on main branch:
   1. Create a new feature branch with name based on the parent spec using `gh` CLI

7. Iterate through each child `[main-spec-path]/[spec-#-title]/0-spec.md` spec file executing the next steps SEQUENTIALLY (DO NOT START WORKING ON THE NEXT SPEC UNTIL FINISHED WORKING ON THE CURRENT ONE):
   1. If the child spec [spec-#-title] is NOT DONE (DO NOT MOVE to next spec UNTIL Feedback for the current child spec is complete):
      1. **Development step** (DO NOT START review UNTIL development is complete)
         1. RUN `ls [main-spec-path]/[spec-#-title]/1-development.md`
         2. If the file 1-development.md is missing:
            1. Please develop the feature described in `[main-spec-path]/[spec-#-title]/0-spec.md`
      2. **Review step**: (DO NOT START feedback update UNTIL review is complete)
         1. RUN `ls [main-spec-path]/[spec-#-title]/2-review.md`
         2. If the file 2-review.md is missing:
            1. Please review the feature developed in the `[main-spec-path]/[spec-#-title]`
      3. **Feedback step**: (DO NOT START the next spec file UNTIL feedback is complete)
         1. RUN `ls [main-spec-path]/[spec-#-title]/4-learnings.md`
         2. If the file 4-learnings.md is missing:
            1. Please work in the feedback comments in `[main-spec-path]/[spec-#-title]`

8. After finished working on all the specs:
   1. RUN `ls [main-spec-path]/result.md` to see if the **result file** is missing
   2. RUN `ls [main-spec-path]/learnings.md` to see if the **learnings file** is missing
   3. If either the **result file** or the **learnings file** are missing, then:
      1. Iterate through each child `[main-spec-path]/[spec-#-title]` spec folder:
         1. RUN `npx repomix [main-spec-path]/[spec-#-title] --include "0-spec.md,1-development.md,3-update.md,4-learnings.md" --stdout --output-show-line-numbers --no-file-summary --no-gitignore`
   4. If the **result file** exist, then read it and jump to the next step, otherwise:
      1. Summarize all the work done and write it down in `[main-spec-path]/result.md`, please be brief.
   5. If the **learnings file** is missing:
      1. Create `[main-spec-path]/learnings.md` with lessons learned, it should be concise but clear for someone else to understand and improve his work.

9. Create a PR, remember to be brief and NOT mention claude code.
