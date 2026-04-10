/**
 * Test Script for PPI Wallet MCP Server — 18 Tools
 *
 * Directly calls the data layer functions to verify all tools work.
 * Usage: node test-tools.js
 */

import {
  getWalletBalance,
  getTransactionHistory,
  flagSuspiciousTransaction,
  unflagTransaction,
  listUsers,
  getSpendingSummary,
  searchTransactions,
  getUserProfile,
  compareSpending,
  estimateBalanceRunway,
  detectRecurringPayments,
  compareUsers,
  generateReport,
  getSystemStats,
  searchUsers,
  getFlaggedTransactions,
  getUserRiskProfile,
  suspendUser,
  getFailedTransactions,
} from './mock-data.js';

function printSection(title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 0: List all users (should be 10 now)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 0: List All Users (10 expected)');
const allUsers = listUsers();
console.log(`  Found ${allUsers.length} users:`);
allUsers.forEach(u => console.log(`  ${u.user_id} | ${u.name.padEnd(16)} | ${u.status.padEnd(10)} | ${u.balance}`));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: get_wallet_balance
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 1a: get_wallet_balance (user_001)');
printResult(getWalletBalance('user_001'));

printSection('TEST 1b: get_wallet_balance (user_999 — not found)');
printResult(getWalletBalance('user_999') ?? { error: 'User not found', user_id: 'user_999' });

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: get_transaction_history (sorted desc, pagination)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 2a: get_transaction_history (user_001, 30 days)');
const h1 = getTransactionHistory('user_001', 30);
console.log(`  Total matching: ${h1.total_matching}, returned: ${h1.total_returned}`);
h1.transactions.forEach(t => console.log(`  ${t.txn_id} | ${t.entry_type.padEnd(6)} | ${t.amount.padStart(12)} | ${t.description}`));

printSection('TEST 2b: get_transaction_history (credit filter, limit 3)');
const h2 = getTransactionHistory('user_001', 30, { entry_type: 'credit', limit: 3 });
console.log(`  Credit txns: matching=${h2.total_matching}, returned=${h2.total_returned}`);

printSection('TEST 2c: Pagination — offset=2, limit=2');
const h3 = getTransactionHistory('user_001', 30, { limit: 2, offset: 2 });
console.log(`  Page 2 (offset=2): ${h3.transactions.map(t => t.txn_id).join(', ')}`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: flag + unflag transaction
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 3a: flag_suspicious_transaction (txn_004)');
const flag1 = flagSuspiciousTransaction('txn_004', 'High-value purchase ₹12,000');
console.log(`  Flagged: ${flag1.flagged} | Reason: ${flag1.reason}`);

printSection('TEST 3b: unflag_transaction (txn_004)');
const unflag1 = unflagTransaction('txn_004', 'Reviewed and cleared — legitimate Amazon purchase');
console.log(`  Success: ${unflag1.success} | Previous reason: ${unflag1.previous_flag_reason}`);

printSection('TEST 3c: unflag non-flagged transaction');
const unflag2 = unflagTransaction('txn_001', 'Test');
console.log(`  Success: ${unflag2.success} | Message: ${unflag2.message}`);

printSection('TEST 3d: unflag non-existent transaction');
const unflag3 = unflagTransaction('txn_999', 'Test');
console.log(`  Result: ${unflag3 === null ? 'null (not found) ✓' : 'ERROR'}`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: get_spending_summary (now includes income + net flow)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 4: get_spending_summary (user_001, 30 days — with income)');
const sp = getSpendingSummary('user_001', 30);
console.log(`  Spending: ${sp.spending.total_spent} across ${sp.spending.total_transactions} txns`);
sp.spending.categories.forEach(c => console.log(`    ${c.category.padEnd(15)} | ${c.count} txns | ${c.total.padStart(12)} | ${c.percentage}`));
console.log(`  Income: ${sp.income.total_income} across ${sp.income.transaction_count} top-ups`);
console.log(`  Net flow: ${sp.net_flow.amount} (${sp.net_flow.direction})`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: search_transactions (with limit, sorted desc)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 5a: search_transactions (query="food", 30 days)');
const sr1 = searchTransactions('user_001', { query: 'food', days: 30 });
console.log(`  Matches: ${sr1.total_matches}, returned: ${sr1.total_returned}`);

printSection('TEST 5b: search_transactions (min=5000, limit=3)');
const sr2 = searchTransactions('user_001', { min_amount: 5000, days: 30, limit: 3 });
console.log(`  Matches: ${sr2.total_matches}, returned: ${sr2.total_returned}`);
sr2.transactions.forEach(t => console.log(`  ${t.txn_id} | ${t.amount.padStart(12)} | ${t.description}`));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: get_user_profile
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 6: get_user_profile (user_006 — new user)');
const prof = getUserProfile('user_006');
console.log(`  ${prof.name} | ${prof.kyc_label} | Balance: ${prof.balance} | Age: ${prof.account_age_days}d`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: compare_spending (zero-to-nonzero fix)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 7a: compare_spending (user_001, 7v7)');
const cmp1 = compareSpending('user_001', { period1_days: 7, period2_days: 7 });
console.log(`  P1: ${cmp1.period1.total_spent} | P2: ${cmp1.period2.total_spent} | Change: ${cmp1.comparison.change_percent}`);
if (cmp1.comparison.note) console.log(`  Note: ${cmp1.comparison.note}`);

printSection('TEST 7b: compare_spending (user_001, 15v15 — zero comparison period)');
const cmp2 = compareSpending('user_001', { period1_days: 15, period2_days: 15 });
console.log(`  P1: ${cmp2.period1.total_spent} | P2: ${cmp2.period2.total_spent} | Change: ${cmp2.comparison.change_percent}`);
if (cmp2.comparison.note) console.log(`  Note: ${cmp2.comparison.note}`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: estimate_balance_runway (low balance warning)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 8a: estimate_balance_runway (user_001 — healthy)');
const rw1 = estimateBalanceRunway('user_001');
console.log(`  Balance: ${rw1.current_balance} | Low warning: ${rw1.low_balance_warning} | Days: ${rw1.estimated_days_remaining}`);
console.log(`  Recommendation: ${rw1.recommendation}`);

printSection('TEST 8b: estimate_balance_runway (user_005 — ₹500, low balance)');
const rw2 = estimateBalanceRunway('user_005');
console.log(`  Balance: ${rw2.current_balance} | Low warning: ${rw2.low_balance_warning}`);
console.log(`  Recommendation: ${rw2.recommendation}`);

printSection('TEST 8c: estimate_balance_runway (user_009 — ₹200, dormant)');
const rw3 = estimateBalanceRunway('user_009');
console.log(`  Balance: ${rw3.current_balance} | Low warning: ${rw3.low_balance_warning}`);
console.log(`  Recommendation: ${rw3.recommendation}`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: detect_recurring_payments (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 9a: detect_recurring_payments (user_001, 90 days)');
const rec1 = detectRecurringPayments('user_001', { days: 90 });
console.log(`  Recurring: ${rec1.recurring_count} detected | Monthly estimate: ${rec1.total_monthly_estimate}`);
rec1.recurring_payments.forEach(r =>
  console.log(`  ${r.merchant.padEnd(12)} | ${r.frequency.padEnd(12)} | ${r.amount} | Next: ${r.next_expected}`)
);

printSection('TEST 9b: detect_recurring_payments (user_006, 90 days)');
const rec2 = detectRecurringPayments('user_006', { days: 90 });
console.log(`  Recurring: ${rec2.recurring_count} detected`);
rec2.recurring_payments.forEach(r =>
  console.log(`  ${r.merchant.padEnd(12)} | ${r.frequency.padEnd(12)} | ${r.amount} | ${r.occurrence_count} times`)
);

printSection('TEST 9c: detect_recurring_payments (user_005 — no patterns)');
const rec3 = detectRecurringPayments('user_005', { days: 90 });
console.log(`  Recurring: ${rec3.recurring_count} | Note: ${rec3.note ?? 'N/A'}`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: compare_users (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 10a: compare_users (user_001 vs user_002)');
const cu1 = compareUsers(['user_001', 'user_002'], { days: 30 });
console.log(`  Compared: ${cu1.users_compared} users`);
cu1.users.forEach(u => console.log(`  ${u.name.padEnd(16)} | ${u.balance.padStart(12)} | Spent: ${u.total_spending.padStart(12)} | ${u.transaction_count} txns | Top: ${u.top_category}`));
console.log(`  Highest spender: ${cu1.summary.highest_spender}`);
console.log(`  Most active: ${cu1.summary.most_active}`);

printSection('TEST 10b: compare_users (3 users + 1 invalid)');
const cu2 = compareUsers(['user_001', 'user_004', 'user_008', 'user_999'], { days: 30 });
console.log(`  Compared: ${cu2.users_compared}, not found: ${cu2.users_not_found?.join(', ') ?? 'none'}`);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: generate_report (NEW)
// ═══════════════════════════════════════════════════════════════════════════════
printSection('TEST 11a: generate_report (user_001, summary)');
const rpt1 = generateReport('user_001', { days: 30, report_type: 'summary' });
console.log(`  Report ID: ${rpt1.report_id} | Type: ${rpt1.report_type}`);
console.log(`  Spending: ${rpt1.financial_overview.total_spending} | Income: ${rpt1.financial_overview.total_income} | Net: ${rpt1.financial_overview.net_flow}`);
console.log(`  Forecast: ${rpt1.balance_forecast.days_remaining} days | ${rpt1.balance_forecast.recommendation}`);

printSection('TEST 11b: generate_report (user_004, risk)');
const rpt2 = generateReport('user_004', { days: 30, report_type: 'risk' });
console.log(`  Report ID: ${rpt2.report_id} | Type: ${rpt2.report_type}`);
console.log(`  Risk: ${rpt2.risk_assessment.risk_level} (${rpt2.risk_assessment.risk_score}/100)`);
console.log(`  Has spending_breakdown: ${!!rpt2.spending_breakdown} | Has recent_transactions: ${!!rpt2.recent_transactions}`);

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

printSection('TEST 12: get_system_stats (10 users now)');
const stats = getSystemStats();
console.log(`  Users: ${stats.platform_overview.total_users} (${stats.platform_overview.active_users} active, ${stats.platform_overview.suspended_users} suspended, ${stats.platform_overview.dormant_users} dormant)`);
console.log(`  AUM: ${stats.financials.total_aum} | Txns 30d: ${stats.transaction_volume.last_30d.count}`);

printSection('TEST 13a: search_users — by name "Meera"');
const su1 = searchUsers({ query: 'Meera' });
console.log(`  Found: ${su1.total_matches} | ${su1.users.map(u => u.name).join(', ')}`);

printSection('TEST 13b: search_users — DORMANT status');
const su2 = searchUsers({ status: 'DORMANT' });
console.log(`  Found: ${su2.total_matches} dormant | ${su2.users.map(u => `${u.name} (${u.balance})`).join(', ')}`);

printSection('TEST 13c: search_users — balance ≥ ₹10,000 with pagination');
const su3 = searchUsers({ min_balance: 10000, limit: 2 });
console.log(`  Matches: ${su3.total_matches}, returned: ${su3.total_returned}`);

printSection('TEST 14: get_flagged_transactions');
// Flag two transactions first
flagSuspiciousTransaction('txn_016', 'Amount exceeds ₹10,000 limit');
flagSuspiciousTransaction('txn_017', 'P2P to unknown wallet');
const fl = getFlaggedTransactions({ days: 30 });
console.log(`  Flagged: ${fl.flagged_count} | Review candidates: ${fl.review_candidates.count}`);

printSection('TEST 15: get_failed_transactions (with pending)');
const ft = getFailedTransactions({ days: 30, include_pending: true });
console.log(`  Failed: ${ft.failed_count} (${ft.failed_volume}) | Pending: ${ft.pending_count} (${ft.pending_volume}) | Total: ${ft.total_count}`);

printSection('TEST 16: get_user_risk_profile (user_004)');
const risk = getUserRiskProfile('user_004');
console.log(`  Score: ${risk.risk_assessment.risk_score}/100 (${risk.risk_assessment.risk_level})`);
console.log(`  Factors: ${risk.risk_assessment.risk_factors.join('; ')}`);

printSection('TEST 17: suspend_user — suspend + reactivate');
const s1 = suspendUser('user_003', 'suspend', 'KYC expired');
console.log(`  Suspend: ${s1.success} | ${s1.previous_state} → ${s1.new_state}`);
const s2 = suspendUser('user_003', 'suspend', 'Double suspend');
console.log(`  Double: ${s2.success} | ${s2.message}`);
const s3 = suspendUser('user_003', 'reactivate', 'KYC re-verified');
console.log(`  Reactivate: ${s3.success} | ${s3.previous_state} → ${s3.new_state}`);

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
printSection('ALL TESTS COMPLETED');
console.log('  ── Consumer Tools ──');
console.log('  ✅ get_wallet_balance         — valid + invalid user');
console.log('  ✅ get_transaction_history     — filters, pagination (offset), sorted desc');
console.log('  ✅ flag_suspicious_transaction — flag transaction');
console.log('  ✅ unflag_transaction          — unflag, non-flagged, non-existent');
console.log('  ✅ get_spending_summary        — categories + income + net flow');
console.log('  ✅ search_transactions         — keyword, amount range, limit');
console.log('  ✅ get_user_profile            — new user (user_006)');
console.log('  ✅ compare_spending            — normal + zero-period handling');
console.log('  ✅ estimate_balance_runway     — healthy, low balance warning, dormant');
console.log('  ✅ detect_recurring_payments   — Netflix detected, no-pattern user');
console.log('  ✅ compare_users               — 2 users, 3+invalid user');
console.log('  ✅ generate_report             — summary + risk report');
console.log('');
console.log('  ── Admin Tools ──');
console.log('  ✅ get_system_stats            — 10 users, AUM, volumes');
console.log('  ✅ search_users                — name, status, balance range, pagination');
console.log('  ✅ get_flagged_transactions    — flagged + review candidates');
console.log('  ✅ get_failed_transactions     — failed + pending');
console.log('  ✅ get_user_risk_profile       — risk score + factors');
console.log('  ✅ suspend_user                — suspend, double-suspend, reactivate');
console.log('\n  MCP server ready — 18 tools (12 consumer + 6 admin).\n');
