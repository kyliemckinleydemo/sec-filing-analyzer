#!/bin/bash
# Count all tests across Vitest (unit + integration) and Playwright (e2e)
# Usage: ./scripts/count-tests.sh [--run]
#   --run    Execute test suites to get exact counts (slower but accurate)
#   (default) Static grep count from source files (fast, may miss dynamic tests)

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/__tests__"

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m'

strip_ansi() { sed 's/\x1b\[[0-9;]*m//g'; }

run_mode=false
if [[ "${1:-}" == "--run" ]]; then
  run_mode=true
fi

echo -e "${BOLD}Test Count Summary${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# --- Vitest (unit + integration) ---
vitest_files=$(find "$TEST_DIR" -name '*.test.ts' -o -name '*.test.tsx' | sort)
vitest_file_count=$(echo "$vitest_files" | wc -l | tr -d ' ')

if $run_mode; then
  echo -e "${DIM}Running vitest...${NC}"
  vitest_output=$(cd "$PROJECT_ROOT" && npx vitest run 2>&1 | strip_ansi || true)
  # Vitest summary line looks like: "Tests  18 files | 212 passed (212)"
  tests_line=$(echo "$vitest_output" | grep -E 'Tests.*passed' || true)
  vitest_passed=$(echo "$tests_line" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || true)
  vitest_failed=$(echo "$tests_line" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)
  vitest_total="${vitest_passed:-0}"
  if [[ -n "$vitest_failed" ]]; then
    vitest_total=$(( ${vitest_passed:-0} + vitest_failed ))
  fi
  vitest_total="${vitest_total:-0}"
  vitest_passed="${vitest_passed:-0}"

  echo -e "${CYAN}Vitest${NC} (unit + integration)"
  echo -e "  Files:  ${BOLD}$vitest_file_count${NC}"
  if [[ -n "$vitest_failed" && "$vitest_failed" -gt 0 ]] 2>/dev/null; then
    echo -e "  Tests:  ${BOLD}$vitest_total${NC} ${GREEN}($vitest_passed passed)${NC} ${YELLOW}($vitest_failed failed)${NC}"
  else
    echo -e "  Tests:  ${BOLD}$vitest_total${NC} ${GREEN}($vitest_passed passed)${NC}"
  fi
else
  # Static count: grep for test( and it( calls
  vitest_unit_files=$(find "$TEST_DIR/unit" -name '*.test.ts' -o -name '*.test.tsx' 2>/dev/null | sort)
  vitest_int_files=$(find "$TEST_DIR/integration" -name '*.test.ts' -o -name '*.test.tsx' 2>/dev/null | sort)
  unit_count=0
  int_count=0

  if [[ -n "$vitest_unit_files" ]]; then
    unit_count=$(echo "$vitest_unit_files" | xargs grep -cE '^\s*(test|it)\(' | awk -F: '{s+=$NF} END {print s+0}')
  fi
  if [[ -n "$vitest_int_files" ]]; then
    int_count=$(echo "$vitest_int_files" | xargs grep -cE '^\s*(test|it)\(' | awk -F: '{s+=$NF} END {print s+0}')
  fi
  vitest_total=$((unit_count + int_count))

  echo -e "${CYAN}Vitest${NC} (unit + integration)"
  echo -e "  Files:  ${BOLD}$vitest_file_count${NC}"
  echo -e "  Tests:  ~${BOLD}$vitest_total${NC} ${DIM}(static count)${NC}"
  echo -e "    Unit:        ~$unit_count  ($(echo "$vitest_unit_files" | wc -l | tr -d ' ') files)"
  echo -e "    Integration: ~$int_count  ($(echo "$vitest_int_files" | wc -l | tr -d ' ') files)"
fi

echo ""

# --- Playwright (e2e) ---
e2e_files=$(find "$TEST_DIR/e2e" -name '*.spec.ts' -o -name '*.spec.js' 2>/dev/null | sort)
e2e_file_count=$(echo "$e2e_files" | wc -l | tr -d ' ')

if $run_mode; then
  echo -e "${DIM}Listing playwright tests...${NC}"
  pw_output=$(cd "$PROJECT_ROOT" && npx playwright test --list 2>&1 | strip_ansi || true)
  # Playwright --list outputs "  N tests" on last line, or lists individual test names
  e2e_total=$(echo "$pw_output" | grep -oE '[0-9]+ tests?' | grep -oE '[0-9]+' | tail -1 || true)
  if [[ -z "$e2e_total" ]]; then
    # Fallback: count indented lines (test names)
    e2e_total=$(echo "$pw_output" | grep -cE '^\s+\S' || true)
  fi
  e2e_total="${e2e_total:-0}"
  echo -e "${CYAN}Playwright${NC} (e2e)"
  echo -e "  Files:  ${BOLD}$e2e_file_count${NC}"
  echo -e "  Tests:  ${BOLD}$e2e_total${NC}"
else
  if [[ -n "$e2e_files" ]]; then
    e2e_total=$(echo "$e2e_files" | xargs grep -cE '^\s*test\(' | awk -F: '{s+=$NF} END {print s+0}')
  else
    e2e_total=0
  fi
  echo -e "${CYAN}Playwright${NC} (e2e)"
  echo -e "  Files:  ${BOLD}$e2e_file_count${NC}"
  echo -e "  Tests:  ~${BOLD}$e2e_total${NC} ${DIM}(static count)${NC}"
fi

echo ""

# --- Bash tests (*.bats or test_*.sh) ---
bash_tests=$(find "$PROJECT_ROOT" -name '*.bats' -o -name 'test_*.sh' 2>/dev/null | head -20)
if [[ -n "$bash_tests" ]]; then
  bash_file_count=$(echo "$bash_tests" | wc -l | tr -d ' ')
  bash_test_count=$(echo "$bash_tests" | xargs grep -cE '@test|^test_' 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
  echo -e "${CYAN}Bash${NC} (bats/shell)"
  echo -e "  Files:  ${BOLD}$bash_file_count${NC}"
  echo -e "  Tests:  ~${BOLD}$bash_test_count${NC}"
  echo ""
fi

# --- Grand total ---
grand_total=$((vitest_total + e2e_total))
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if $run_mode; then
  echo -e "${BOLD}Total:  $grand_total tests${NC} across $((vitest_file_count + e2e_file_count)) files"
else
  echo -e "${BOLD}Total:  ~$grand_total tests${NC} across $((vitest_file_count + e2e_file_count)) files"
  echo -e "${DIM}Run with --run for exact counts from test runners${NC}"
fi
