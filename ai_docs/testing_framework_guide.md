# Testing Framework Guide

This document provides comprehensive guidelines for understanding, using, and extending the testing framework in the Shavatta project.

## Overview

The project uses a modern testing stack designed for reliability, performance, and developer experience:

- **Vitest**: Fast unit test runner with hot reload
- **React Testing Library**: Component testing with user-centric approach
- **jsdom**: DOM simulation in Node.js environment
- **@testing-library/user-event**: User interaction simulation
- **c8**: Code coverage reporting

## Test Suite Statistics

- **Total Tests**: 106 tests across all components
- **Pass Rate**: 100% (106/106 passing)
- **Coverage**: 80% minimum threshold enforced
- **Test Files**: 5 component test suites

## Available Commands

```bash
# Development testing (watch mode)
pnpm test

# Run all tests once (CI/production)
pnpm test:run

# Coverage report
pnpm test:coverage
```

## Project Structure

```
src/__tests__/
├── components/           # Component tests mirroring src structure
│   ├── forms/
│   │   └── SuscribeForm.test.tsx
│   └── inputs/
│       ├── Button.test.tsx
│       ├── Checkbox.test.tsx
│       ├── SelectInput.test.tsx
│       └── TextInput.test.tsx
├── integration/          # Integration tests (future)
├── utils/               # Testing utilities and helpers
│   ├── mock-data.ts     # Mock API responses and test data
│   ├── mock-providers.tsx  # Mock React providers
│   └── test-utils.tsx   # Custom render and utilities
├── setup.ts            # Global test setup
└── types.d.ts          # Test-specific type definitions
```

## Writing Tests

### Basic Component Test Structure

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../utils/test-utils';
import YourComponent from '@components/path/to/YourComponent';

describe('YourComponent', () => {
  // Basic rendering tests
  it('renders correctly with default props', () => {
    render(<YourComponent />);

    const element = screen.getByRole('button'); // Use semantic queries
    expect(element).toBeInTheDocument();
  });

  // State and prop tests
  it('handles props correctly', () => {
    render(<YourComponent isDisabled />);

    const element = screen.getByRole('button');
    expect(element).toBeDisabled();
  });

  // Event handling tests
  it('calls handler when clicked', async () => {
    const handleClick = vi.fn();
    const { user } = render(<YourComponent onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Testing Best Practices

#### 1. Use Semantic Queries

```typescript
// ✅ Good - semantic and accessible
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email address/i);
screen.getByPlaceholderText(/enter your email/i);

// ❌ Avoid - implementation details
screen.getByClassName('btn-primary');
screen.getByTestId('submit-button'); // Only when necessary
```

#### 2. Test User Interactions

```typescript
// ✅ Good - simulates real user behavior
const { user } = render(<Component />);
await user.type(input, 'test@example.com');
await user.click(button);

// ❌ Avoid - direct DOM manipulation
fireEvent.change(input, { target: { value: 'test@example.com' } });
```

#### 3. Test Behavior, Not Implementation

```typescript
// ✅ Good - tests what user sees
expect(screen.getByText(/success message/i)).toBeInTheDocument();

// ❌ Avoid - tests internal state
expect(component.state.isSuccess).toBe(true);
```

#### 4. Use waitFor for Async Operations

```typescript
// ✅ Good - waits for async state changes
await waitFor(() => {
  expect(screen.getByText(/loading complete/i)).toBeInTheDocument();
});

// ❌ Avoid - doesn't handle async properly
expect(screen.getByText(/loading complete/i)).toBeInTheDocument();
```

### Mocking Guidelines

#### API Calls

```typescript
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
});

// Mock successful response
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve({ success: true }),
});
```

#### External Libraries

```typescript
// Mock react-google-recaptcha
vi.mock('react-google-recaptcha', () => ({
  __esModule: true,
  default: vi.fn().mockImplementation(({ sitekey, size, ...props }) => {
    React.useImperativeHandle(props.ref, () => ({
      executeAsync: vi.fn().mockResolvedValue('mock-token'),
      reset: vi.fn()
    }), []);

    return <div data-testid="recaptcha" />;
  })
}));
```

#### LocalStorage

```typescript
beforeEach(() => {
  localStorage.clear();
});

// Set test data
localStorage.setItem('key', JSON.stringify(testData));
```

### Component Testing Patterns

#### Form Components

- Test initial render state
- Test input validation (valid/invalid states)
- Test form submission (success/error cases)
- Test loading states
- Test accessibility (focus, keyboard navigation)

#### Input Components

- Test different input types
- Test controlled vs uncontrolled behavior
- Test disabled states
- Test error states and styling
- Test event handlers (onChange, onKeyDown, etc.)

#### Container Components

- Test data fetching and loading states
- Test error boundaries
- Test conditional rendering
- Test prop drilling and context

## Test Utilities

### Custom Render Function

The project provides a custom render function that wraps components with necessary providers:

```typescript
import { render } from '../../utils/test-utils';

// Automatically wraps with LenisProvider and other necessary providers
const { user } = render(<YourComponent />);
```

### Mock Data

Use the centralized mock data for consistent testing:

```typescript
import { mockApiResponses, mockFormData } from '../../utils/mock-data';

// Use predefined mock responses
mockFetch.mockResolvedValueOnce(mockApiResponses.success);
```

## Coverage Requirements

The project enforces minimum coverage thresholds:

- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%

Coverage reports are generated in the `coverage/` directory and can be viewed in the browser.

## Continuous Integration

Tests are designed to run in CI environments with:

- Deterministic results (no flaky tests)
- Fast execution (< 5 seconds for full suite)
- Clear error messages for debugging
- Coverage enforcement

## Debugging Tests

### Common Issues and Solutions

#### 1. Async State Updates

```typescript
// ✅ Use waitFor for state changes
await waitFor(() => {
  expect(screen.getByText(/updated/i)).toBeInTheDocument();
});
```

#### 2. User Event Timing

```typescript
// ✅ Always await user events
await user.type(input, 'text');
await user.click(button);
```

#### 3. React Warnings

```typescript
// ✅ Provide required props to avoid warnings
render(<Checkbox checked readOnly />); // For controlled components
render(<SelectInput onChange={() => {}} />); // For controlled selects
```

### Debugging Commands

```bash
# Run specific test file
pnpm test Button.test.tsx

# Run tests in verbose mode
pnpm test --reporter=verbose
```

## Adding New Tests

### For New Components

1. Create test file in corresponding `__tests__/components/` directory
2. Follow the established naming convention: `ComponentName.test.tsx`
3. Use the component test template above
4. Include all testing categories:
   - Basic rendering
   - Props and state
   - Event handling
   - Accessibility
   - Edge cases

### For New Features

1. Add integration tests if the feature spans multiple components
2. Update mock data if new API endpoints are involved
3. Ensure coverage thresholds are maintained
4. Add relevant test utilities if needed

## Performance Considerations

- Tests run in parallel by default
- Mock heavy dependencies (APIs, external libraries)
- Use `vi.fn()` for function mocks instead of full implementations
- Clean up after tests (localStorage, timers, etc.)

## Best Practices Summary

1. **Test behavior, not implementation**
2. **Use semantic queries for accessibility**
3. **Mock external dependencies**
4. **Test error conditions and edge cases**
5. **Keep tests focused and independent**
6. **Use descriptive test names**
7. **Follow AAA pattern (Arrange, Act, Assert)**
8. **Maintain high coverage without sacrificing quality**

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about/)
- [Common Testing Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
