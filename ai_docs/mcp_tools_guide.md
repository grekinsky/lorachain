# MCP (Model Context Protocol) Tools Guide

This guide provides comprehensive documentation on the installed MCP servers and their tools, helping you understand when and how to use each one effectively in the Lorachain project.

## Overview

MCP servers extend Claude's capabilities with specialized tools. The Lorachain project has three MCP servers configured:

1. **Serena** - Advanced semantic code analysis and manipulation
2. **Context7** - Library documentation retrieval
3. **Playwright** - Browser automation and web interaction

## Serena MCP

### Purpose

Serena provides intelligent, semantic-aware code analysis and manipulation tools that understand code structure beyond simple text matching. It's designed for efficient codebase navigation and modification without reading entire files.

### When to Use Serena

- **Code exploration**: Understanding codebase architecture and relationships
- **Targeted code reading**: Reading specific functions/classes without loading entire files
- **Code modifications**: Making precise, symbol-aware edits
- **Memory management**: Storing and retrieving project-specific knowledge
- **Codebase search**: Finding symbols, patterns, and references efficiently

### Serena Tools

#### 1. `check_onboarding_performed`

- **Use**: Always call first when starting work on a project
- **Purpose**: Verifies if project onboarding has been completed
- **Returns**: Status and list of available memory files

#### 2. `onboarding`

- **Use**: Call if onboarding hasn't been performed
- **Purpose**: Creates initial project understanding and memories
- **Returns**: Instructions for creating onboarding information

#### 3. `list_dir`

- **Use**: Explore directory structure
- **Parameters**:
  - `relative_path`: Directory to list (use "." for root)
  - `recursive`: Include subdirectories
- **Better than**: `ls` command for project-aware filtering

#### 4. `find_file`

- **Use**: Locate files by name pattern
- **Parameters**:
  - `file_mask`: Filename or pattern (wildcards: \*, ?)
  - `relative_path`: Directory to search in
- **Example**: Find all test files: `find_file("*.test.ts", "packages/core")`

#### 5. `search_for_pattern`

- **Use**: Flexible regex search across codebase
- **Parameters**:
  - `substring_pattern`: Regex pattern
  - `restrict_search_to_code_files`: Limit to code files only
  - `paths_include_glob`: Include specific file patterns
  - `paths_exclude_glob`: Exclude specific file patterns
  - `context_lines_before/after`: Include context lines
- **Better for**: Complex patterns, non-code files (YAML, HTML)

#### 6. `get_symbols_overview`

- **Use**: First tool for understanding a new file
- **Parameters**:
  - `relative_path`: File to analyze
- **Returns**: Top-level symbols (classes, functions, etc.)
- **Example**: `get_symbols_overview("packages/core/src/blockchain.ts")`

#### 7. `find_symbol`

- **Use**: Locate and read specific code symbols
- **Parameters**:
  - `name_path`: Symbol path (e.g., "Blockchain", "Blockchain/addBlock", "/Blockchain")
  - `relative_path`: Optional file/directory restriction
  - `depth`: Retrieve nested symbols (e.g., class methods)
  - `include_body`: Include source code
  - `substring_matching`: Allow partial name matches
- **Path patterns**:
  - `method` - finds any method named "method"
  - `class/method` - finds "method" inside "class"
  - `/class` - finds only top-level "class"

#### 8. `find_referencing_symbols`

- **Use**: Find all references to a symbol
- **Parameters**:
  - `name_path`: Symbol to find references for
  - `relative_path`: File containing the symbol
- **Returns**: List of symbols that reference the target

#### 9. `replace_symbol_body`

- **Use**: Replace entire symbol implementation
- **Parameters**:
  - `name_path`: Symbol to replace
  - `relative_path`: File containing symbol
  - `body`: New implementation (no leading indentation)
- **Best for**: Rewriting complete functions/methods

#### 10. `insert_before_symbol` / `insert_after_symbol`

- **Use**: Add new code relative to existing symbols
- **Parameters**:
  - `name_path`: Reference symbol
  - `relative_path`: File path
  - `body`: Code to insert
- **Examples**:
  - Add imports: `insert_before_symbol` with first symbol
  - Add new methods: `insert_after_symbol` with last method

#### 11. `write_memory` / `read_memory` / `list_memories`

- **Use**: Store and retrieve project-specific knowledge
- **Parameters**:
  - `memory_name`: Meaningful identifier
  - `content`: Information to store (Markdown format)
- **Examples**:
  - Architecture decisions
  - Complex workflows
  - API patterns

#### 12. `think_about_*` tools

- `think_about_collected_information`: Call after research phase
- `think_about_task_adherence`: Call before making changes
- `think_about_whether_you_are_done`: Call when task seems complete

### Serena Best Practices

1. **Start with overview, then drill down**:

   ```
   get_symbols_overview → find_symbol with depth → find_symbol with include_body
   ```

2. **Avoid reading entire files**:
   - ❌ `Read("entire_file.ts")`
   - ✅ `find_symbol("ClassName/methodName", include_body=True)`

3. **Use symbolic operations for edits**:
   - ❌ Text-based find/replace
   - ✅ `replace_symbol_body` for complete rewrites
   - ✅ `insert_before_symbol` for additions

4. **Leverage memories for context**:
   - Check existing memories: `list_memories()`
   - Store important findings: `write_memory()`

## Context7 MCP

### Purpose

Context7 provides access to up-to-date documentation for libraries and frameworks, ensuring you have the latest API references and best practices.

### When to Use Context7

- **Library documentation**: Get current docs for any npm package
- **API references**: Look up specific API methods and parameters
- **Framework patterns**: Understand best practices and usage patterns
- **Version-specific docs**: Access documentation for specific versions

### Context7 Tools

#### 1. `resolve-library-id`

- **Use**: First step - convert package name to Context7 ID
- **Parameters**:
  - `libraryName`: Package/library name (e.g., "react", "express")
- **Returns**: Context7-compatible library ID
- **Example**: `resolve-library-id("vitest")` → `/vitest/vitest`

#### 2. `get-library-docs`

- **Use**: Retrieve actual documentation
- **Parameters**:
  - `context7CompatibleLibraryID`: ID from resolve-library-id
  - `tokens`: Max documentation tokens (default: 10000)
  - `topic`: Focus area (e.g., "testing", "configuration")
- **Example**:
  ```
  get-library-docs("/vitest/vitest", topic="mocking", tokens=15000)
  ```

### Context7 Best Practices

1. **Always resolve ID first** (unless user provides `/org/project` format)
2. **Use topic parameter** to get focused documentation
3. **Increase tokens** for comprehensive documentation
4. **Cache results mentally** - avoid repeated lookups

## Playwright MCP

### Purpose

Playwright enables browser automation for web scraping, testing, and interaction with web applications.

### When to Use Playwright

- **Web testing**: Automated browser testing
- **Web scraping**: Extract data from websites
- **Form automation**: Fill and submit web forms
- **Screenshot capture**: Visual documentation or debugging
- **API testing**: Test web APIs through browser

### Playwright Tools

#### Navigation & Control

1. **`browser_navigate`**: Go to URL
2. **`browser_navigate_back/forward`**: Browser history navigation
3. **`browser_close`**: Close browser
4. **`browser_resize`**: Set viewport size
5. **`browser_install`**: Install browser if missing

#### Page Interaction

6. **`browser_snapshot`**: Get accessibility tree (better than screenshot for automation)
7. **`browser_take_screenshot`**: Capture visual screenshot
8. **`browser_click`**: Click elements
9. **`browser_type`**: Type text into inputs
10. **`browser_select_option`**: Select dropdown options
11. **`browser_hover`**: Hover over elements
12. **`browser_drag`**: Drag and drop

#### Element Interaction

13. **`browser_evaluate`**: Execute JavaScript on page
14. **`browser_press_key`**: Keyboard input
15. **`browser_file_upload`**: Upload files
16. **`browser_wait_for`**: Wait for conditions

#### Tab Management

17. **`browser_tab_list`**: List open tabs
18. **`browser_tab_new`**: Open new tab
19. **`browser_tab_select`**: Switch tabs
20. **`browser_tab_close`**: Close tabs

#### Debugging

21. **`browser_console_messages`**: Get console output
22. **`browser_network_requests`**: View network activity
23. **`browser_handle_dialog`**: Handle alerts/prompts

### Playwright Best Practices

1. **Use snapshot over screenshot** for element identification
2. **Always provide human-readable element descriptions**
3. **Use exact element references** from snapshots
4. **Handle async operations** with wait_for
5. **Check console/network** for debugging

## Practical Usage Examples

### Example 1: Understanding a Complex Class

```python
# Using Serena effectively
1. get_symbols_overview("packages/core/src/blockchain.ts")
2. find_symbol("Blockchain", depth=1)  # See all methods
3. find_symbol("Blockchain/addBlock", include_body=True)  # Read specific method
4. find_referencing_symbols("Blockchain/addBlock", "packages/core/src/blockchain.ts")
```

### Example 2: Adding New Feature

```python
# Research phase
1. search_for_pattern("transaction.*validation")  # Find related code
2. find_symbol("UTXOTransactionManager", depth=1)
3. read_memory("project_overview")  # Get context

# Implementation phase
4. insert_after_symbol("UTXOTransactionManager/validateTransaction",
                      body="new validation method")
5. write_memory("transaction_validation_enhancement",
               content="Added new validation...")
```

### Example 3: Getting Library Documentation

```python
# For Vitest testing framework
1. resolve-library-id("vitest")
2. get-library-docs("/vitest/vitest", topic="mocking")

# For specific version
3. get-library-docs("/vitest/vitest/v1.0.0", topic="configuration")
```

### Example 4: Web Interaction

```python
# Automated testing scenario
1. browser_navigate("http://localhost:3000")
2. browser_snapshot()  # Get page structure
3. browser_type(element="username input", ref="[data-testid='username']",
               text="testuser")
4. browser_click(element="submit button", ref="[type='submit']")
5. browser_wait_for(text="Login successful")
6. browser_take_screenshot(filename="login-success.png")
```

## Decision Tree: Which MCP to Use?

```
Need to work with code?
├─ Yes → Serena
│   ├─ Exploring/understanding? → get_symbols_overview, find_symbol
│   ├─ Searching? → search_for_pattern, find_file
│   ├─ Editing? → replace_symbol_body, insert_*_symbol
│   └─ Storing knowledge? → write_memory
│
├─ Need library documentation?
│   └─ Yes → Context7
│       ├─ resolve-library-id
│       └─ get-library-docs
│
└─ Need web interaction?
    └─ Yes → Playwright
        ├─ Testing? → navigate, click, type, snapshot
        ├─ Scraping? → navigate, evaluate, network_requests
        └─ Screenshots? → take_screenshot
```

## Performance Tips

1. **Batch operations** when possible
2. **Use precise selectors** in Serena (name_path, relative_path)
3. **Cache Context7 results** mentally - avoid repeated lookups
4. **Prefer snapshot to screenshot** in Playwright for faster automation
5. **Use memories** to avoid re-analyzing the same code

## Common Pitfalls to Avoid

1. **Don't read entire files** when you need specific symbols
2. **Don't use text search** when symbolic search would work
3. **Don't skip onboarding** - memories provide valuable context
4. **Don't fetch library docs repeatedly** - cache the information
5. **Don't use screenshots for element identification** - use snapshots

## Integration with Lorachain Development

### For Core Development

- Use Serena's `find_symbol` to navigate UTXO classes
- Store architectural decisions with `write_memory`
- Track references with `find_referencing_symbols` before refactoring

### For Testing

- Get Vitest docs with Context7 for test patterns
- Use Serena to find and update test files
- Playwright for end-to-end testing of web interfaces

### For Documentation

- Serena's `get_symbols_overview` for generating API docs
- Context7 for referencing correct library usage
- Playwright for capturing UI screenshots

---

This guide is a living document. Update it as you discover new patterns and best practices for using MCP tools effectively.
