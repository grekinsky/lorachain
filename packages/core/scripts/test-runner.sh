#!/bin/bash

# Test Runner Wrapper Script
# Ensures proper test execution with timeout enforcement and process cleanup

set -euo pipefail

# Default values
TIMEOUT=300  # 5 minutes default timeout
TEST_TYPE="unit"
CLEANUP_ON_EXIT=true
KILL_EXISTING=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE        Test type: unit, integration, all (default: unit)"
    echo "  -T, --timeout SECONDS  Timeout in seconds (default: 300)"
    echo "  -k, --kill-existing    Kill existing vitest processes before starting"
    echo "  -n, --no-cleanup       Don't cleanup processes on exit"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                     # Run unit tests with default timeout"
    echo "  $0 -t integration      # Run integration tests"
    echo "  $0 -t all -T 600       # Run all tests with 10 minute timeout"
    echo "  $0 -k                  # Kill existing processes and run unit tests"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -T|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -k|--kill-existing)
            KILL_EXISTING=true
            shift
            ;;
        -n|--no-cleanup)
            CLEANUP_ON_EXIT=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Validate test type
if [[ ! "$TEST_TYPE" =~ ^(unit|integration|all)$ ]]; then
    echo -e "${RED}Error: Invalid test type '$TEST_TYPE'. Must be one of: unit, integration, all${NC}"
    exit 1
fi

# Function to log with color
log() {
    local color=$1
    local message=$2
    echo -e "${color}[$(date +'%Y-%m-%d %H:%M:%S')] $message${NC}"
}

# Function to check for existing vitest processes
check_existing_processes() {
    local processes
    processes=$(pgrep -fl 'vitest.*core' || true)
    if [[ -n "$processes" ]]; then
        log $YELLOW "Found existing vitest processes:"
        echo "$processes"
        return 0
    else
        log $GREEN "No existing vitest processes found"
        return 1
    fi
}

# Function to kill vitest processes
kill_vitest_processes() {
    log $YELLOW "Killing existing vitest processes..."
    pkill -f 'vitest.*core' || true
    sleep 2
    
    # Force kill if still running
    local remaining
    remaining=$(pgrep -fl 'vitest.*core' || true)
    if [[ -n "$remaining" ]]; then
        log $YELLOW "Force killing remaining processes..."
        pkill -9 -f 'vitest.*core' || true
    fi
    
    log $GREEN "Process cleanup completed"
}

# Function to run tests with timeout
run_tests_with_timeout() {
    local test_command
    
    case "$TEST_TYPE" in
        unit)
            test_command="pnpm test:unit"
            ;;
        integration)
            test_command="pnpm test:integration"
            ;;
        all)
            test_command="pnpm test"
            ;;
    esac
    
    log $BLUE "Starting $TEST_TYPE tests with ${TIMEOUT}s timeout..."
    log $BLUE "Command: $test_command"
    
    # Run tests with timeout
    if timeout "$TIMEOUT" $test_command; then
        log $GREEN "✓ Tests completed successfully"
        return 0
    else
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            log $RED "✗ Tests timed out after ${TIMEOUT} seconds"
            kill_vitest_processes
        else
            log $RED "✗ Tests failed with exit code $exit_code"
        fi
        return $exit_code
    fi
}

# Cleanup function
cleanup() {
    if [[ "$CLEANUP_ON_EXIT" == true ]]; then
        log $YELLOW "Performing cleanup..."
        kill_vitest_processes
    fi
}

# Main execution
main() {
    log $BLUE "=== Vitest Test Runner ==="
    log $BLUE "Test type: $TEST_TYPE"
    log $BLUE "Timeout: ${TIMEOUT}s"
    log $BLUE "Kill existing: $KILL_EXISTING"
    log $BLUE "Cleanup on exit: $CLEANUP_ON_EXIT"
    echo ""
    
    # Set up cleanup trap
    if [[ "$CLEANUP_ON_EXIT" == true ]]; then
        trap cleanup EXIT INT TERM
    fi
    
    # Check for existing processes
    if check_existing_processes; then
        if [[ "$KILL_EXISTING" == true ]]; then
            kill_vitest_processes
        else
            log $YELLOW "Warning: Existing vitest processes found. Use -k to kill them automatically."
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log $YELLOW "Aborted by user"
                exit 1
            fi
        fi
    fi
    
    # Run the tests
    if run_tests_with_timeout; then
        log $GREEN "=== Test execution completed successfully ==="
        exit 0
    else
        log $RED "=== Test execution failed ==="
        exit 1
    fi
}

# Execute main function
main "$@"