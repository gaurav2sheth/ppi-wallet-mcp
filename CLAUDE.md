# PPI Wallet MCP Server

39 Claude AI tools exposed via Model Context Protocol for natural language wallet operations.

**Part of the PPI Wallet Platform** — see root `CLAUDE.md` for ecosystem overview.

## Tech

Node.js + `@modelcontextprotocol/sdk` + Zod validation. Runs via stdio transport in Claude Desktop.

## Key Files

| File | Purpose |
|------|---------|
| `wallet-mcp-server.js` | All 39 tool definitions with Zod schemas |
| `mock-data.js` | 200 seeded users, 500+ transactions, BigInt paise arithmetic |
| `chat-handler.js` | Claude chat with tool orchestration |
| `services/sub-wallet-service.js` | Sub-wallet CRUD: load, spend, eligibility, utilisation |
| `services/wallet-load-guard.js` | 3 RBI rules + Claude Haiku suggestions |
| `services/kyc-alert-service.js` | KYC expiry detection + Claude Haiku personalised messages |

## Tool Categories (39 Total)

- **User Tools (12)**: get_wallet_balance, get_transaction_history, flag/unflag_suspicious_transaction, get_spending_summary, search_transactions, get_user_profile, compare_spending, detect_recurring_payments, generate_report, get_notifications, set_alert_threshold
- **Transaction Tools (5)**: add_money, pay_merchant, transfer_p2p, pay_bill, request_refund
- **Admin Tools (10)**: get_system_stats, search_users, get_flagged_transactions, suspend_user, get_failed_transactions, get_kyc_stats, check_compliance, compare_users, get_peak_usage, get_monthly_trends
- **KYC Tools (5)**: approve_kyc, reject_kyc, request_kyc_upgrade, query_kyc_expiry, generate_kyc_renewal_report
- **Support Tools (3)**: raise_dispute, get_dispute_status, get_refund_status
- **Sub-Wallet Tools (4)**: get_sub_wallets, load_sub_wallet, get_sub_wallet_transactions, validate_merchant_eligibility

## Mock Data (mock-data.js)

- 200 users with wallets (seeded with deterministic PRNG, seed 42)
- Sub-wallets for users with 5 types (seeded with PRNG seed 500)
- Employers: employer_001 (Paytm), employer_002 (TCS)
- All balances use BigInt arithmetic internally, serialised as strings at API boundary
- 41 exported functions for data access and mutation
