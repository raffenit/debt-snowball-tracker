# Source Modules

This directory contains the shared, modular source code for the debt-snowball-tracker.

## Module Structure

```
src/
├── constants.js      # Application constants (STORE_URL_PATH, MAX_SIMULATION_MONTHS, etc.)
├── date-utils.js     # Date manipulation and month key utilities
├── pure-utils.js     # Pure utility functions (formatMoney, calcAutoMin, escHtml, etc.)
├── simulation.js     # Core debt payoff simulation engine
└── README.md         # This file
```

## Module Descriptions

### `constants.js`
Application-wide constants:
- `STORE_URL_PATH` - Home Assistant storage dashboard URL
- `MAX_SIMULATION_MONTHS` - Maximum timeline projection (1200 months / 100 years)
- `DEFAULT_STRATEGY` - Default payoff strategy ('snowball')
- `DEBT_CHART_COLORS` - Color palette for chart visualization

### `date-utils.js`
Date and month key utilities (all pure functions):
- `currentMonthKey()` - Get current month as "YYYY-M" string
- `formatMonthLabel(key)` - Format month key as human-readable
- `monthKeyToIndex(key)` - Convert to numeric for comparison
- `addMonthsToKey(key, n)` - Add months to a key
- `isCostDueThisMonth(cost, workingMonthKey)` - Check if cost is due
- `isCostDueInMonth(cost, monthKey)` - Check cost due in specific month
- `generateBiweeklyForMonth()` - Generate biweekly income entries
- `generateRecurringIncomeForMonth()` - Generate monthly income entries
- `intervalLabel(n)` - Get human-readable interval label

### `pure-utils.js`
General pure utility functions:
- `formatMoney(n, currency, locale)` - Currency formatting with Intl
- `formatMoneySimple(n)` - Simple $X,XXX.XX formatting
- `formatOrdinal(day)` - Add ordinal suffix (1st, 2nd, 3rd)
- `escHtml(str)` - Escape HTML entities
- `calcAutoMin(balance, aprPct)` - Calculate credit card minimum payment

### `simulation.js`
Core simulation engine (depends on date-utils and constants):
- `runSimulation(strategy)` - Run snowball/avalanche simulation
- `runSimulationWithWindfall(amount, strategy)` - Simulate with extra payment
- `getStrategyOrder(debts, strategy)` - Sort debts by strategy
- `setDebts()`, `setRecurringCosts()`, `setIncomeEntries()`, `setStartingBalance()` - State setters

## Usage

### In Tests
Tests import from `tests/helpers.js` which re-exports everything:

```javascript
import {
    runSimulation,
    setDebts,
    formatMoney,
    currentMonthKey,
    MAX_SIMULATION_MONTHS,
} from './helpers.js';
```

### In Main App (Future)
The `dist/debt-snowball-panel.js` is currently self-contained. To use these modules directly, a build step (like Rollup or esbuild) would be needed to bundle them.

## Keeping dist/ in Sync

The `dist/debt-snowball-panel.js` file is a self-contained Home Assistant card. Currently, changes to `src/` must be manually copied to `dist/` (or a build script can be created).

Key functions to keep in sync:
1. `runSimulation()` - Core simulation logic
2. Date utilities - `isCostDueThisMonth()`, `monthKeyToIndex()`, etc.
3. Pure utilities - `formatMoney()`, `calcAutoMin()`, etc.

## Design Principles

1. **Pure Functions**: All utilities in `date-utils.js` and `pure-utils.js` are pure (no side effects)
2. **State Isolation**: `simulation.js` uses module-level state set via explicit setters
3. **Single Source of Truth**: Tests use the same code as the app via `helpers.js` re-exports
4. **ES Modules**: All source uses standard ES module syntax (`import`/`export`)
