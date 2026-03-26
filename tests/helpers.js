// Extracted pure functions from app.js for testing.
// These are copied verbatim — if app.js changes, keep these in sync.
// The simulation functions also need the globals they close over, so we
// expose setters that tests use to configure state before each run.

// ── Globals the simulation closes over (mirroring app.js) ────────────────────
let debts = [];
let recurringCosts = [];
let incomeEntries = [];
let startingBalance = 0;

function setDebts(d)            { debts           = d; }
function setRecurringCosts(c)   { recurringCosts   = c; }
function setIncomeEntries(e)    { incomeEntries     = e; }
function setStartingBalance(b)  { startingBalance   = b; }

// ── Pure helpers ──────────────────────────────────────────────────────────────
function formatOrdinal(day) {
    const s = ['th','st','nd','rd'], v = day % 100;
    return day + (s[(v-20)%10] || s[v] || s[0]);
}

function formatMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

function calcAutoMin(balance, aprPct) {
    if (!balance || balance <= 0) return null;
    const monthlyInterest = balance * (aprPct / 100 / 12);
    const onePercent      = balance * 0.01;
    return Math.max(25, parseFloat((onePercent + monthlyInterest).toFixed(2)));
}

function currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}`;
}

// ── Strategy sorting ──────────────────────────────────────────────────────────
function getStrategyOrder(debtList, strat) {
    const copy = [...debtList];
    if (strat === 'avalanche') {
        copy.sort((a,b) => {
            const ra = a.promoZeroInterest ? (a.originalRate || 0) : a.rate;
            const rb = b.promoZeroInterest ? (b.originalRate || 0) : b.rate;
            return rb - ra || a.balance - b.balance;
        });
    } else {
        copy.sort((a,b) => a.balance - b.balance);
    }
    return copy;
}

// ── Simulation engine (reads module-level globals set by setters above) ───────
// NOTE: effectiveBudget = income - DIRECT costs only.
// Card-charged recurring costs do NOT reduce the immediate cash available
// for debt payoff — they are assumed to be folded into card minimum payments.
function runSimulation(strat) {
    const totalIncome          = incomeEntries.reduce((s,e) => s + e.amount, 0);
    const totalRecurringDirect = recurringCosts.filter(c => c.paymentMethod !== 'card').reduce((s,c) => s + c.amount, 0);
    const totalRecurring       = recurringCosts.reduce((s,c) => s + c.amount, 0);
    const effectiveBudget      = totalIncome - totalRecurringDirect;

    if (debts.length === 0 || totalIncome <= 0 || effectiveBudget <= 0) {
        return { valid: false, totalIncome, totalRecurring, effectiveBudget };
    }

    const totalMinPayments = debts.reduce((s,d) => s + d.minPayment, 0);
    if (effectiveBudget < totalMinPayments) {
        return { valid: false, totalIncome, totalRecurring, effectiveBudget, belowMin: true, totalMinPayments };
    }

    const incomeDays = [...incomeEntries]
        .map(e => ({ day: parseInt(e.date.split('-')[2]), amount: e.amount }))
        .sort((a,b) => a.day - b.day);

    let simDebts = debts.map(d => ({ ...d, interestPaid: 0 }));
    const MAX_MONTHS = 1200;
    let monthsElapsed = 0, totalInterestPaid = 0, payoffLog = [];
    const perDebtMonthly = {};
    simDebts.forEach(d => { perDebtMonthly[d.id] = [d.balance]; });

    while (simDebts.some(d => d.balance > 0) && monthsElapsed < MAX_MONTHS) {
        monthsElapsed++;
        let availableCash = effectiveBudget + (monthsElapsed === 1 ? startingBalance : 0); // eslint-disable-line no-unused-vars

        simDebts.forEach(d => {
            if (d.balance <= 0) return;
            let effectiveRate = d.rate;
            if (d.promoZeroInterest && d.promoExpiryDate) {
                const today   = new Date();
                const simDate = new Date(today.getFullYear(), today.getMonth() + monthsElapsed, 1);
                if (simDate <= new Date(d.promoExpiryDate+'T00:00:00')) effectiveRate = 0;
                else effectiveRate = d.originalRate || d.rate;
            }
            const interest     = d.balance * (effectiveRate / 100 / 12);
            d.balance         += interest;
            totalInterestPaid += interest;
            d.interestPaid    += interest;
        });

        const alive     = simDebts.filter(d => d.balance > 0);
        const ordered   = getStrategyOrder(alive, strat);
        const targetId  = ordered[0]?.id;
        const aliveMinSum  = alive.reduce((s,d) => s + d.minPayment, 0);
        const extraAvail   = Math.max(0, effectiveBudget - aliveMinSum);

        const paymentQueue = alive.map(d => ({
            id:     d.id,
            dueDay: d.dueDay || 1,
            needed: Math.min(
                d.balance,
                d.minPayment + (d.id === targetId ? Math.min(extraAvail, Math.max(0, d.balance - d.minPayment)) : 0)
            )
        })).sort((a,b) => a.dueDay - b.dueDay);

        let cashPool = 0, incomeIdx = 0;
        for (const payment of paymentQueue) {
            while (incomeIdx < incomeDays.length && incomeDays[incomeIdx].day <= payment.dueDay)
                cashPool += incomeDays[incomeIdx++].amount;
            while (cashPool < payment.needed && incomeIdx < incomeDays.length)
                cashPool += incomeDays[incomeIdx++].amount;

            const debt = simDebts.find(d => d.id === payment.id);
            if (!debt || debt.balance <= 0) continue;
            const actual = Math.min(payment.needed, cashPool, debt.balance);
            cashPool    -= actual;
            debt.balance = Math.max(0, debt.balance - actual);
            if (debt.balance <= 0.01) {
                debt.balance = 0;
                if (!payoffLog.find(l => l.id === debt.id))
                    payoffLog.push({ ...debt, payoffMonth: monthsElapsed });
            }
        }
        simDebts.forEach(d => { perDebtMonthly[d.id].push(Math.max(0, d.balance)); });
    }

    const debtPayoffMonths = {};
    payoffLog.forEach(l => { debtPayoffMonths[l.id] = l.payoffMonth; });
    const maxLen = Math.max(...Object.values(perDebtMonthly).map(a => a.length));
    const monthlyTotals = Array.from({ length: maxLen }, (_,i) =>
        Object.values(perDebtMonthly).reduce((sum, arr) => sum + (arr[i] ?? 0), 0)
    );

    return { valid: true, monthsElapsed, totalInterestPaid, payoffLog,
             monthlyTotals, perDebtMonthly, debtPayoffMonths,
             totalIncome, totalRecurring, effectiveBudget };
}

function runSimulationWithWindfall(windfall, strat) {
    let simDebts  = debts.map(d => ({ ...d }));
    const ordered = getStrategyOrder(simDebts, strat);
    let remaining = windfall;
    const allocation = [];

    for (const debt of ordered) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, debt.balance);
        const live  = simDebts.find(d => d.id === debt.id);
        if (live) live.balance = Math.max(0, live.balance - apply);
        allocation.push({ name: debt.name, applied: apply });
        remaining -= apply;
    }

    const originalDebts = debts;
    debts = simDebts.filter(d => d.balance > 0.01);
    const result = runSimulation(strat);
    debts = originalDebts;
    result.allocation = allocation;
    return result;
}

export {
    formatOrdinal, formatMoney, escHtml, calcAutoMin, currentMonthKey,
    getStrategyOrder, runSimulation, runSimulationWithWindfall,
    setDebts, setRecurringCosts, setIncomeEntries, setStartingBalance,
};
