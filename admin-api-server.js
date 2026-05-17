/**
 * Admin REST API server for PPI Wallet platform.
 * Exposes mock-data.js over HTTP so the admin dashboard can read it.
 * Deploy this to Render as a separate web service.
 */

import express from 'express';
import cors from 'cors';
import { users, transactions, subWalletStore, getSystemStats, getKycStats } from './mock-data.js';

const app = express();

const ALLOWED_ORIGINS = [
  'https://gaurav2sheth.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://localhost:4174',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// Serialize BigInt → string recursively
function serial(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v));
}

const CITIES = ['Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata'];

function userToCustomer(u, idx) {
  const balance = BigInt(u.balance_paise);
  const held    = BigInt(u.held_paise);
  return {
    wallet_id:        u.user_id,
    user_id:          u.user_id,
    name:             u.name,
    phone:            u.phone,
    email:            u.name.toLowerCase().replace(/\s+/g, '.') + '@example.com',
    city:             CITIES[idx % CITIES.length],
    state:            u.state,
    kyc_tier:         u.kyc_tier,
    balance_paise:    balance.toString(),
    available_paise:  (balance - held).toString(),
    created_at:       u.created_at,
    last_activity_at: u.last_activity_at,
  };
}

function txnToLedger(t) {
  const isCredit = t.type === 'load' || t.type === 'refund';
  return {
    id:                  t.txn_id,
    entry_type:          isCredit ? 'CREDIT' : 'DEBIT',
    amount_paise:        t.amount_paise.toString(),
    balance_after_paise: '0',
    held_paise_after:    '0',
    transaction_type:    t.type === 'load' ? 'ADD_MONEY'
                       : t.type === 'transfer' ? 'P2P_TRANSFER'
                       : t.type === 'refund' ? 'REFUND'
                       : 'MERCHANT_PAY',
    reference_id:        t.txn_id,
    description:         t.description ?? t.merchant ?? null,
    idempotency_key:     t.txn_id,
    hold_id:             null,
    created_at:          t.timestamp,
    payment_source:      t.type === 'load' ? 'UPI' : undefined,
  };
}

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ppi-wallet-admin-api', version: '1.0.0' });
});

// ── GET /api/admin/customers ─────────────────────────────────────────────────
app.get('/api/admin/customers', (_req, res) => {
  const all = Array.from(users.values());
  res.json(serial(all.map(userToCustomer)));
});

// ── GET /api/admin/transactions ──────────────────────────────────────────────
app.get('/api/admin/transactions', (_req, res) => {
  const userArr = Array.from(users.values());
  const all = transactions.map(t => {
    const u = users.get(t.user_id);
    return { ...txnToLedger(t), wallet_id: t.user_id, customer_name: u?.name ?? 'Unknown' };
  });
  all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(serial(all));
});

// ── GET /api/admin/metrics ───────────────────────────────────────────────────
app.get('/api/admin/metrics', (_req, res) => {
  const stats = getSystemStats();
  const kyc   = getKycStats();
  const allUsers = Array.from(users.values());
  const totalFloat = allUsers.reduce((s, u) => s + BigInt(u.balance_paise), 0n);
  const fullKycEntry = kyc.distribution?.find(d => d.state === 'FULL_KYC');
  const fullKycShare = fullKycEntry ? fullKycEntry.count / kyc.total_users : 0;

  const today = new Date().toISOString().slice(0, 10);
  const todayTxns = transactions.filter(t => t.timestamp.startsWith(today));
  const volumeToday = todayTxns.reduce((s, t) => s + BigInt(t.amount_paise), 0n);

  res.json(serial({
    totalWallets:     stats.platform_overview.total_users,
    activeWallets:    stats.platform_overview.active_users,
    fullKycShare,
    totalFloatPaise:  totalFloat.toString(),
    txnsToday:        todayTxns.length,
    volumeTodayPaise: volumeToday.toString(),
    failedSagasToday: stats.alerts.failed_transactions,
  }));
});

// ── GET /api/wallet/status/:walletId ────────────────────────────────────────
app.get('/api/wallet/status/:walletId', (req, res) => {
  const u = users.get(req.params.walletId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const balance = BigInt(u.balance_paise);
  const held    = BigInt(u.held_paise);
  res.json(serial({
    wallet_id:          u.user_id,
    user_id:            u.user_id,
    state:              u.state,
    kyc_tier:           u.kyc_tier,
    balance_paise:      balance.toString(),
    held_paise:         held.toString(),
    available_paise:    (balance - held).toString(),
    is_active:          u.state === 'ACTIVE',
    wallet_expiry_date: u.wallet_expiry_date ?? null,
    last_activity_at:   u.last_activity_at,
    created_at:         u.created_at,
    updated_at:         u.last_activity_at,
  }));
});

// ── GET /api/wallet/ledger/:walletId ────────────────────────────────────────
app.get('/api/wallet/ledger/:walletId', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const u = users.get(req.params.walletId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const entries = transactions
    .filter(t => t.user_id === req.params.walletId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
    .map(txnToLedger);
  res.json(serial({
    success: true,
    wallet_id: req.params.walletId,
    entries,
    pagination: { next_cursor: null, has_more: false },
  }));
});

// ── GET /api/kyc/status/:walletId ───────────────────────────────────────────
app.get('/api/kyc/status/:walletId', (req, res) => {
  const u = users.get(req.params.walletId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({
    wallet_id:          u.user_id,
    kyc_state:          u.kyc_state,
    kyc_tier:           u.kyc_tier,
    wallet_expiry_date: u.wallet_expiry_date ?? null,
    ckyc_number:        u.ckyc_number ?? null,
    pan_masked:         u.pan_masked ?? null,
    aadhaar_verified:   u.aadhaar_verified ?? false,
  });
});

// ── GET /api/admin/sub-wallets ───────────────────────────────────────────────
app.get('/api/admin/sub-wallets', (_req, res) => {
  const result = [];
  for (const [userId, sws] of subWalletStore.entries()) {
    for (const sw of sws) {
      result.push({
        wallet_id:   userId,
        user_id:     userId,
        type:        sw.type,
        balance_paise: (sw.balance_paise ?? 0n).toString(),
        cap_paise:   sw.max_balance_paise?.toString(),
        expiry_date: sw.expiry_date ?? null,
        is_active:   sw.status === 'ACTIVE',
      });
    }
  }
  res.json(serial(result));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`PPI Wallet Admin API running on port ${PORT}`);
});
