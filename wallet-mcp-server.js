/**
 * PPI Wallet MCP Server
 *
 * A Model Context Protocol server that exposes 3 tools for Claude:
 *   1. get_wallet_balance  — Fetch wallet balance for a user
 *   2. get_transaction_history — Fetch transactions for last N days
 *   3. flag_suspicious_transaction — Flag a transaction as suspicious
 *
 * Runs over stdio transport so Claude Desktop can connect directly.
 *
 * Usage:
 *   node wallet-mcp-server.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';  // Bundled with @modelcontextprotocol/sdk
import {
  getWalletBalance,
  getTransactionHistory,
  flagSuspiciousTransaction,
  unflagTransaction,
  getSpendingSummary,
  searchTransactions,
  getUserProfile,
  compareSpending,
  estimateBalanceRunway,
  detectRecurringPayments,
  compareUsers,
  generateReport,
  // Admin tools
  getSystemStats,
  searchUsers,
  getFlaggedTransactions,
  getUserRiskProfile,
  suspendUser,
  getFailedTransactions,
  getKycStats,
} from './mock-data.js';

// ── Create MCP Server instance ────────────────────────────────────────────────
const server = new McpServer({
  name: 'ppi-wallet',
  version: '1.0.0',
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 1: get_wallet_balance
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_wallet_balance',
  // Description — tells Claude when to use this tool
  'Retrieves the current INR balance and account status for a PPI wallet user. ' +
  'Use this when the user asks about their balance or account standing.',
  // Input schema — strict validation via Zod
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
  },
  // Handler — called when Claude invokes this tool
  async ({ user_id }) => {
    try {
      const result = getWalletBalance(user_id);

      if (!result) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'User not found', user_id }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      // Never let a tool crash the server — return a safe error
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Internal server error',
            message: err.message,
            user_id,
          }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 2: get_transaction_history
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_transaction_history',
  // Description — tells Claude when to use this tool
  'Fetches wallet transactions for a user over a specified number of days. ' +
  'IMPORTANT: Always set the limit parameter when the user asks for a specific number of transactions (e.g. "last 5" → limit=5). ' +
  'Use entry_type to filter credit (money in) vs debit (money out). ' +
  'Use transaction_type to filter by load/pay/transfer. ' +
  'Use this for queries about spending history, recent activity, or transaction patterns.',
  // Input schema
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    days: z.number().default(7).describe('Number of past days to fetch (e.g. 7, 30)'),
    entry_type: z.enum(['credit', 'debit']).optional().describe('Filter by entry type: credit (money in — loads) or debit (money out — payments, transfers)'),
    transaction_type: z.enum(['load', 'pay', 'transfer']).optional().describe('Filter by transaction type: load (top-up), pay (merchant payment), transfer (P2P transfer)'),
    limit: z.number().optional().describe('Maximum number of transactions to return (default: 10). Set this when user asks for a specific count like "last 3" or "top 5".'),
  },
  // Handler
  async ({ user_id, days, entry_type, transaction_type, limit }) => {
    try {
      const result = getTransactionHistory(user_id, days, { entry_type, transaction_type, limit });

      if (!result) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'User not found', user_id }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Internal server error',
            message: err.message,
            user_id,
          }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 3: flag_suspicious_transaction
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'flag_suspicious_transaction',
  // Description — tells Claude when to use this tool
  'Marks a specific transaction as suspicious and logs the reason. ' +
  'Use this when a transaction shows signs of fraud, policy violation, or unusual activity.',
  // Input schema
  {
    txn_id: z.string().describe('Transaction ID to flag (e.g. txn_004)'),
    reason: z.string().describe("Reason for flagging (e.g. 'Amount exceeds RBI PPI limit of ₹10,000')"),
  },
  // Handler
  async ({ txn_id, reason }) => {
    try {
      const result = flagSuspiciousTransaction(txn_id, reason);

      if (!result) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Transaction not found', txn_id }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Internal server error',
            message: err.message,
            txn_id,
          }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 4: get_spending_summary
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_spending_summary',
  'Returns a category-wise spending breakdown (Food, Travel, Shopping, etc.) for a user. ' +
  'Use this when the user asks "how much did I spend on food?", "where is my money going?", or wants a spending analysis.',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    days: z.number().default(30).describe('Number of past days to analyze (default: 30)'),
  },
  async ({ user_id, days }) => {
    try {
      const result = getSpendingSummary(user_id, days);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 5: search_transactions
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'search_transactions',
  'Searches transactions by merchant name, description keyword, or amount range. ' +
  'Use this when the user asks "show me all Swiggy orders", "transactions above ₹5000", or searches for a specific purchase.',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    query: z.string().optional().describe('Search keyword to match against merchant name, description, or category (e.g. "Swiggy", "food", "transfer")'),
    min_amount: z.number().optional().describe('Minimum transaction amount in rupees (e.g. 500)'),
    max_amount: z.number().optional().describe('Maximum transaction amount in rupees (e.g. 5000)'),
    days: z.number().default(30).describe('Number of past days to search (default: 30)'),
    limit: z.number().optional().describe('Maximum number of results to return (default: 20)'),
  },
  async ({ user_id, query, min_amount, max_amount, days, limit }) => {
    try {
      const result = searchTransactions(user_id, { query, min_amount, max_amount, days, limit });
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 6: get_user_profile
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_user_profile',
  'Returns full user profile including KYC tier, account limits, account age, and recent activity stats. ' +
  'Use this when the user asks about their profile, KYC status, daily/monthly limits, or account details.',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
  },
  async ({ user_id }) => {
    try {
      const result = getUserProfile(user_id);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 7: compare_spending
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'compare_spending',
  'Compares spending between two consecutive time periods (e.g. this week vs last week). ' +
  'Use this when the user asks "am I spending more this week?", "compare my spending", or wants trend analysis.',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    period1_days: z.number().default(7).describe('Number of days for the recent period (default: 7)'),
    period2_days: z.number().default(7).describe('Number of days for the comparison period immediately before period 1 (default: 7)'),
  },
  async ({ user_id, period1_days, period2_days }) => {
    try {
      const result = compareSpending(user_id, { period1_days, period2_days });
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 8: estimate_balance_runway
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'estimate_balance_runway',
  'Estimates how many days the user\'s balance will last based on average daily spending. ' +
  'Use this when the user asks "how long will my balance last?", "when will I run out?", or "should I top up?".',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    lookback_days: z.number().default(30).describe('Number of past days to calculate average spending from (default: 30)'),
  },
  async ({ user_id, lookback_days }) => {
    try {
      const result = estimateBalanceRunway(user_id, { lookback_days });
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 9: unflag_transaction
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'unflag_transaction',
  'Removes the suspicious flag from a previously flagged transaction. ' +
  'Use this when a flagged transaction has been reviewed and cleared, or was flagged in error.',
  {
    txn_id: z.string().describe('Transaction ID to unflag (e.g. txn_004)'),
    reason: z.string().describe('Reason for unflagging (e.g. "Reviewed and cleared — legitimate purchase")'),
  },
  async ({ txn_id, reason }) => {
    try {
      const result = unflagTransaction(txn_id, reason);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Transaction not found', txn_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 10: detect_recurring_payments
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'detect_recurring_payments',
  'Detects recurring/subscription payments for a user by analyzing merchant payment patterns. ' +
  'Use this when the user asks "what are my subscriptions?", "recurring charges", or "monthly bills".',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    days: z.number().default(90).describe('Number of past days to analyze for patterns (default: 90)'),
    min_occurrences: z.number().default(2).describe('Minimum number of payments to a merchant to be considered recurring (default: 2)'),
  },
  async ({ user_id, days, min_occurrences }) => {
    try {
      const result = detectRecurringPayments(user_id, { days, min_occurrences });
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 11: compare_users
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'compare_users',
  'Compares multiple users side-by-side on balance, spending, income, and activity. ' +
  'Use this when an admin asks "compare Gaurav and Priya", "who spends more?", or wants a user comparison.',
  {
    user_ids: z.array(z.string()).describe('Array of user IDs to compare (e.g. ["user_001", "user_002"])'),
    days: z.number().default(30).describe('Number of past days to analyze (default: 30)'),
  },
  async ({ user_ids, days }) => {
    try {
      const result = compareUsers(user_ids, { days });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL 12: generate_report
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'generate_report',
  'Generates a comprehensive report for a user. Types: "summary" (overview), "detailed" (full breakdown + transactions), "risk" (risk-focused with flagged details). ' +
  'Use this when the user asks "generate my report", "account summary", or an admin asks for a user report.',
  {
    user_id: z.string().describe('Unique wallet user ID (e.g. user_001)'),
    days: z.number().default(30).describe('Number of past days to cover (default: 30)'),
    report_type: z.enum(['summary', 'detailed', 'risk']).default('summary').describe('Report type: summary, detailed, or risk'),
  },
  async ({ user_id, days, report_type }) => {
    try {
      const result = generateReport(user_id, { days, report_type });
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 1: get_system_stats
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_system_stats',
  'Returns platform-wide statistics: total users, active/suspended counts, total AUM (assets under management), ' +
  'transaction volumes (24h/7d/30d), KYC breakdown, and alert counts. ' +
  'Use this when an admin asks for a "platform overview", "system stats", "how many users", or "total balance".',
  {},
  async () => {
    try {
      const result = getSystemStats();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 2: search_users
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'search_users',
  'Searches for wallet users by name, phone number, KYC tier, KYC state, account status, or balance range. ' +
  'Use this when an admin asks "show me all suspended users", "find users with minimum KYC", ' +
  '"who has balance above ₹1 lakh?", "pending KYC users", or searches for a specific person.',
  {
    query: z.string().optional().describe('Search by name, phone number, or user ID'),
    kyc_tier: z.enum(['FULL', 'MINIMUM']).optional().describe('Filter by KYC tier'),
    kyc_state: z.enum(['UNVERIFIED', 'MIN_KYC', 'FULL_KYC_PENDING', 'FULL_KYC', 'REJECTED', 'SUSPENDED']).optional().describe('Filter by KYC verification state'),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DORMANT']).optional().describe('Filter by account status'),
    min_balance: z.number().optional().describe('Minimum balance in rupees (e.g. 1000)'),
    max_balance: z.number().optional().describe('Maximum balance in rupees (e.g. 10000)'),
  },
  async ({ query, kyc_tier, kyc_state, status, min_balance, max_balance }) => {
    try {
      const result = searchUsers({ query, kyc_tier, kyc_state, status, min_balance, max_balance });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 3: get_flagged_transactions
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_flagged_transactions',
  'Lists all transactions that have been flagged as suspicious across all users. ' +
  'Also shows high-value unflagged transactions as review candidates. ' +
  'Use this when an admin asks "what transactions have been flagged?", "show suspicious activity", or "any fraud alerts?".',
  {
    days: z.number().default(30).describe('Number of past days to scan for review candidates (default: 30)'),
  },
  async ({ days }) => {
    try {
      const result = getFlaggedTransactions({ days });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 4: get_user_risk_profile
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_user_risk_profile',
  'Generates a comprehensive risk assessment for a specific user. Aggregates risk signals including ' +
  'high-value transactions, transaction velocity, flagged count, balance utilization, P2P volume, and account status. ' +
  'Returns a 0-100 risk score with LOW/MEDIUM/HIGH classification and actionable recommendations. ' +
  'Use this when an admin asks "is this user high-risk?", "risk profile for Anita Desai", or "should we investigate this user?".',
  {
    user_id: z.string().describe('User ID to assess (e.g. user_004)'),
  },
  async ({ user_id }) => {
    try {
      const result = getUserRiskProfile(user_id);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 5: suspend_user
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'suspend_user',
  'Suspends or reactivates a user account with a mandatory reason. ' +
  'Use action "suspend" to disable an account or "reactivate" to re-enable a suspended account. ' +
  'Use this when an admin says "suspend Vikram Patel for KYC non-compliance" or "reactivate user_005".',
  {
    user_id: z.string().describe('User ID to suspend or reactivate (e.g. user_005)'),
    action: z.enum(['suspend', 'reactivate']).describe('Action to perform: "suspend" or "reactivate"'),
    reason: z.string().describe('Mandatory reason for the action (e.g. "KYC non-compliance", "Fraud investigation cleared")'),
  },
  async ({ user_id, action, reason }) => {
    try {
      const result = suspendUser(user_id, action, reason);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found', user_id }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 6: get_failed_transactions
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_failed_transactions',
  'Lists all failed (and optionally pending) transactions across all users. ' +
  'Shows transaction details with user info, amounts, and failure context. ' +
  'Use this when an admin asks "show failed transactions", "any payment failures today?", or "stuck transactions".',
  {
    days: z.number().default(30).describe('Number of past days to scan (default: 30)'),
    include_pending: z.boolean().default(false).describe('Set to true to also include pending/stuck transactions'),
  },
  async ({ days, include_pending }) => {
    try {
      const result = getFailedTransactions({ days, include_pending });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN TOOL 7: get_kyc_stats
// ═══════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_kyc_stats',
  'Returns platform-wide KYC statistics: distribution by state (FULL_KYC, MIN_KYC, PENDING, REJECTED), ' +
  'pending verification queue, rejected users with reasons, expiring wallets, and success/failure rates. ' +
  'Use this when an admin asks "KYC stats", "how many pending KYC?", "rejected users", "expiring wallets", or "KYC completion rate".',
  {},
  async () => {
    try {
      const result = getKycStats();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Internal server error', message: err.message }, null, 2) }], isError: true };
    }
  }
);

// ── Start the server over stdio transport ─────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with MCP's stdout protocol
  console.error('[PPI Wallet MCP] Server started — waiting for Claude connection via stdio');
}

main().catch((err) => {
  console.error('[PPI Wallet MCP] Fatal error:', err);
  process.exit(1);
});
