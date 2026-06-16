import React, { useState, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell, Legend,
} from 'recharts';
import {
  ShieldAlert, TrendingDown, TrendingUp, Scale, Plus, X, Play,
  Loader2, AlertTriangle, ChevronDown, Activity,
} from 'lucide-react';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtCurrency = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtCurrencyFull = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtPct = (v) => `${v.toFixed(2)}%`;

// ─── Default Assets ──────────────────────────────────────────────────────────
const DEFAULT_ASSETS = [
  { id: 1, name: 'US Equities', allocation: 60, annualReturn: 10, annualVolatility: 20 },
  { id: 2, name: 'US Bonds',    allocation: 30, annualReturn: 4,  annualVolatility: 6 },
  { id: 3, name: 'Gold',        allocation: 10, annualReturn: 6,  annualVolatility: 15 },
];

const ASSET_COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee',
  '#a78bfa', '#fb923c', '#4ade80', '#f87171', '#38bdf8',
];

let nextId = 4;

// ─── Skeleton Loader ─────────────────────────────────────────────────────────
function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="glass-card p-6 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="skeleton h-4 w-24 mb-4" />
          <div className="skeleton h-8 w-36 mb-2" />
          <div className="skeleton h-3 w-28" />
        </div>
      ))}
      <div className="col-span-full glass-card p-6 animate-fade-in" style={{ animationDelay: '320ms' }}>
        <div className="skeleton h-4 w-48 mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, color, glowClass, delay }) {
  const borderColor = {
    rose: 'rgba(244, 63, 94, 0.5)',
    emerald: 'rgba(52, 211, 153, 0.5)',
    indigo: 'rgba(129, 140, 248, 0.5)',
    amber: 'rgba(251, 191, 36, 0.5)',
  }[color];

  const iconColor = {
    rose: 'text-rose-400',
    emerald: 'text-emerald-400',
    indigo: 'text-indigo-400',
    amber: 'text-amber-400',
  }[color];

  return (
    <div
      className="glass-card p-5 relative overflow-hidden animate-slide-up"
      style={{ animationDelay: `${delay}ms`, borderTop: `2px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} className={iconColor} />
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl lg:text-3xl font-bold font-mono-num ${glowClass}`} style={{ color: borderColor }}>
        {value}
      </div>
      {sub && <p className="text-xs text-slate-500 mt-2">{sub}</p>}
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function GlassTooltip({ active, payload, label, prefix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-xs border border-indigo-500/20">
      <p className="text-indigo-300 font-semibold mb-1">{prefix}{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#e2e8f0' }}>
          {p.name}: <span className="font-mono-num">{typeof p.value === 'number' ? fmtCurrency(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main App
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── State ────────────────────────────────────────────────────────────────
  const [assets, setAssets] = useState(DEFAULT_ASSETS);
  const [initialInvestment, setInitialInvestment] = useState(100000);
  const [timeHorizon, setTimeHorizon] = useState(1);
  const [numSimulations, setNumSimulations] = useState(10000);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const totalAllocation = useMemo(
    () => assets.reduce((s, a) => s + (parseFloat(a.allocation) || 0), 0),
    [assets]
  );
  const allocationValid = Math.abs(totalAllocation - 100) < 0.01;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const updateAsset = useCallback((id, field, value) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }, []);

  const addAsset = useCallback(() => {
    setAssets((prev) => [
      ...prev,
      { id: nextId++, name: `Asset ${prev.length + 1}`, allocation: 0, annualReturn: 8, annualVolatility: 15 },
    ]);
  }, []);

  const removeAsset = useCallback((id) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const runSimulation = useCallback(async () => {
    if (!allocationValid) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        assets: assets.map((a) => ({
          name: a.name,
          allocation: parseFloat(a.allocation) / 100,
          annual_return: parseFloat(a.annualReturn) / 100,
          annual_volatility: parseFloat(a.annualVolatility) / 100,
        })),
        initial_investment: parseFloat(initialInvestment),
        time_horizon_years: parseFloat(timeHorizon),
        num_simulations: parseInt(numSimulations),
        confidence_level: parseFloat(confidenceLevel),
      };
      const apiBaseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiBaseUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error: ${res.status}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [assets, initialInvestment, timeHorizon, numSimulations, confidenceLevel, allocationValid]);

  // ── Chart data ───────────────────────────────────────────────────────────
  const distributionData = useMemo(() => {
    if (!result) return [];
    return result.distribution.map((count, i) => {
      const lo = result.distribution_bins[i];
      const hi = result.distribution_bins[i + 1];
      const mid = (lo + hi) / 2;
      return { mid, count, aboveInitial: mid >= result.metrics.initial_investment };
    });
  }, [result]);

  const pathsData = useMemo(() => {
    if (!result?.sample_paths?.length) return [];
    const numSteps = result.sample_paths[0].values.length;
    const dt = parseFloat(timeHorizon) / (numSteps - 1);
    return Array.from({ length: numSteps }, (_, step) => {
      const point = { step, time: (step * dt).toFixed(2) };
      result.sample_paths.forEach((p, pi) => {
        point[`p${pi}`] = p.values[step];
      });
      return point;
    });
  }, [result, timeHorizon]);

  const pathColors = useMemo(() => {
    if (!result?.sample_paths) return [];
    const n = result.sample_paths.length;
    return result.sample_paths.map((_, i) => {
      if (i < 5) return { color: `hsl(0, 70%, ${55 + i * 5}%)`, opacity: 0.5 };      // worst → reds
      if (i < 10) return { color: `hsl(220, 15%, ${55 + (i - 5) * 4}%)`, opacity: 0.4 }; // median → grays
      return { color: `hsl(150, 65%, ${45 + (i - 10) * 5}%)`, opacity: 0.55 };         // best → greens
    });
  }, [result]);

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen pb-16">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-indigo-500/10">
        {/* Animated grid background */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(129,140,248,0.5) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-indigo-400" size={28} />
            <h1 className="text-3xl sm:text-4xl font-extrabold gradient-text tracking-tight">
              Portfolio Risk Analyzer
            </h1>
          </div>
          <p className="text-slate-400 text-sm sm:text-base mb-3">Monte Carlo Simulation Engine</p>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full px-3 py-1">
            Powered by GBM · NumPy Vectorized
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        {/* ── Configuration Panel ──────────────────────────────────────── */}
        <section className="glass-card p-5 sm:p-6 mb-8">
          <h2 className="text-lg font-bold text-slate-200 mb-5 flex items-center gap-2">
            <ChevronDown size={18} className="text-indigo-400" />
            Portfolio Configuration
          </h2>

          {/* Asset Table */}
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
                  <th className="text-left py-2 pr-2">Asset Name</th>
                  <th className="text-center py-2 px-2">Allocation %</th>
                  <th className="text-center py-2 px-2">Return %</th>
                  <th className="text-center py-2 px-2">Volatility %</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {assets.map((asset, idx) => (
                  <tr
                    key={asset.id}
                    className="border-b border-slate-800/50 animate-fade-in"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={asset.name}
                        onChange={(e) => updateAsset(asset.id, 'name', e.target.value)}
                        className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-slate-200 w-full min-w-[120px] focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={asset.allocation}
                          onChange={(e) => updateAsset(asset.id, 'allocation', e.target.value)}
                          className="flex-1 h-1.5 accent-indigo-500 min-w-[60px]"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={asset.allocation}
                          onChange={(e) => updateAsset(asset.id, 'allocation', e.target.value)}
                          className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-center text-slate-200 w-16 font-mono-num focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        step="0.5"
                        value={asset.annualReturn}
                        onChange={(e) => updateAsset(asset.id, 'annualReturn', e.target.value)}
                        className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-center text-slate-200 w-20 font-mono-num focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        step="0.5"
                        value={asset.annualVolatility}
                        onChange={(e) => updateAsset(asset.id, 'annualVolatility', e.target.value)}
                        className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-center text-slate-200 w-20 font-mono-num focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </td>
                    <td className="py-2 pl-2">
                      {assets.length > 1 && (
                        <button
                          onClick={() => removeAsset(asset.id)}
                          className="text-slate-600 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-500/10"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Asset Button */}
          <button
            onClick={addAsset}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mb-5 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
          >
            <Plus size={14} /> Add Asset
          </button>

          {/* Allocation Bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Allocation</span>
              <span className={`text-xs font-mono-num font-semibold ${allocationValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {totalAllocation.toFixed(1)}% / 100%
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden flex">
              {assets.map((a, i) => {
                const pct = parseFloat(a.allocation) || 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={a.id}
                    className="h-full transition-all duration-300"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: ASSET_COLORS[i % ASSET_COLORS.length] }}
                    title={`${a.name}: ${pct}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {assets.map((a, i) => (
                <div key={a.id} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ASSET_COLORS[i % ASSET_COLORS.length] }} />
                  {a.name}
                </div>
              ))}
            </div>
            {!allocationValid && (
              <div className="flex items-center gap-1.5 mt-2 text-amber-400 text-xs animate-fade-in">
                <AlertTriangle size={13} />
                Allocations must sum to 100%
              </div>
            )}
          </div>

          {/* Simulation Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Initial Investment ($)</label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={initialInvestment}
                onChange={(e) => setInitialInvestment(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 w-full font-mono-num focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">
                Time Horizon: <span className="text-indigo-300 font-mono-num">{parseFloat(timeHorizon).toFixed(2)}y</span>
              </label>
              <input
                type="range"
                min="0.25"
                max="10"
                step="0.25"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(e.target.value)}
                className="w-full h-2 accent-indigo-500 mt-1"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>3m</span><span>5y</span><span>10y</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Simulations</label>
              <select
                value={numSimulations}
                onChange={(e) => setNumSimulations(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 w-full focus:outline-none focus:border-indigo-500/50 transition-colors"
              >
                {[1000, 5000, 10000, 25000, 50000].map((n) => (
                  <option key={n} value={n}>{n.toLocaleString()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Confidence Level</label>
              <select
                value={confidenceLevel}
                onChange={(e) => setConfidenceLevel(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 w-full focus:outline-none focus:border-indigo-500/50 transition-colors"
              >
                <option value="0.90">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </div>
          </div>

          {/* Run Button */}
          <button
            onClick={runSimulation}
            disabled={loading || !allocationValid}
            className={`
              w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl
              font-semibold text-sm text-white transition-all duration-200
              ${loading
                ? 'bg-indigo-600/50 cursor-wait pulse-glow'
                : !allocationValid
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]'
              }
            `}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            {loading ? 'Running Simulation…' : 'Run Simulation'}
          </button>
        </section>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="glass-card border-rose-500/30 p-5 mb-8 animate-slide-up flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-rose-300 font-semibold text-sm">Simulation Failed</p>
              <p className="text-slate-400 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* ── Loading Skeleton ──────────────────────────────────────────── */}
        {loading && !result && <SkeletonCards />}

        {/* ── Results Dashboard ─────────────────────────────────────────── */}
        {result && (
          <div className="animate-slide-up">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <MetricCard
                icon={ShieldAlert}
                label="Value at Risk"
                value={fmtCurrency(result.metrics.var)}
                sub={`${(result.metrics.confidence_level * 100).toFixed(0)}% confidence level`}
                color="rose"
                glowClass="glow-rose"
                delay={0}
              />
              <MetricCard
                icon={TrendingDown}
                label="Expected Shortfall"
                value={fmtCurrency(result.metrics.cvar)}
                sub={`Avg loss in worst ${((1 - result.metrics.confidence_level) * 100).toFixed(0)}%`}
                color="rose"
                glowClass="glow-rose"
                delay={80}
              />
              <MetricCard
                icon={TrendingUp}
                label="Expected Value"
                value={fmtCurrency(result.metrics.mean_value)}
                sub={`${((result.metrics.mean_value / result.metrics.initial_investment - 1) * 100).toFixed(2)}% from initial`}
                color="emerald"
                glowClass="glow-emerald"
                delay={160}
              />
              <MetricCard
                icon={Scale}
                label="Risk / Reward"
                value={
                  result.metrics.var > 0
                    ? ((result.metrics.mean_value - result.metrics.initial_investment) / result.metrics.var).toFixed(2)
                    : 'N/A'
                }
                sub="Mean excess return / VaR"
                color="amber"
                glowClass="glow-amber"
                delay={240}
              />
            </div>

            {/* Distribution Chart */}
            <section className="glass-card p-5 sm:p-6 mb-8 animate-slide-up" style={{ animationDelay: '300ms' }}>
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
                Distribution of Portfolio Outcomes
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={distributionData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.08)" />
                  <XAxis
                    dataKey="mid"
                    tickFormatter={fmtCurrency}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={{ stroke: 'rgba(99,102,241,0.15)' }}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={{ stroke: 'rgba(99,102,241,0.15)' }}
                    width={40}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="glass-card px-3 py-2 text-xs border border-indigo-500/20">
                          <p className="text-indigo-300 font-semibold mb-1">
                            Value: <span className="font-mono-num">{fmtCurrency(payload[0].payload.mid)}</span>
                          </p>
                          <p className="text-slate-300">
                            Count: <span className="font-mono-num">{payload[0].value}</span>
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[1, 1, 0, 0]} maxBarSize={6}>
                    {distributionData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.aboveInitial ? 'rgba(52, 211, 153, 0.65)' : 'rgba(244, 63, 94, 0.65)'}
                      />
                    ))}
                  </Bar>
                  {/* Reference lines */}
                  <ReferenceLine
                    x={result.metrics.initial_investment}
                    stroke="#818cf8"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'Initial', position: 'top', fill: '#818cf8', fontSize: 10 }}
                  />
                  <ReferenceLine
                    x={result.metrics.initial_investment - result.metrics.var}
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'VaR', position: 'top', fill: '#f43f5e', fontSize: 10 }}
                  />
                  <ReferenceLine
                    x={result.metrics.mean_value}
                    stroke="#34d399"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'Mean', position: 'top', fill: '#34d399', fontSize: 10 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Simulated Paths */}
            <section className="glass-card p-5 sm:p-6 mb-8 animate-slide-up" style={{ animationDelay: '400ms' }}>
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">
                Sample Simulation Paths
              </h3>
              <p className="text-xs text-slate-500 mb-4">15 representative trajectories — worst (red), median (gray), best (green)</p>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={pathsData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.08)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={{ stroke: 'rgba(99,102,241,0.15)' }}
                    label={{ value: 'Time (years)', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 10 }}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis
                    tickFormatter={fmtCurrency}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={{ stroke: 'rgba(99,102,241,0.15)' }}
                    width={70}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="glass-card px-3 py-2 text-xs border border-indigo-500/20">
                          <p className="text-indigo-300 font-semibold mb-1">Year {label}</p>
                          {payload.slice(0, 3).map((p, i) => (
                            <p key={i} style={{ color: p.stroke }}>
                              {p.name}: <span className="font-mono-num">{fmtCurrency(p.value)}</span>
                            </p>
                          ))}
                          {payload.length > 3 && (
                            <p className="text-slate-500">+{payload.length - 3} more paths</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={result.metrics.initial_investment}
                    stroke="#818cf8"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: 'Initial', position: 'right', fill: '#818cf8', fontSize: 10 }}
                  />
                  {result.sample_paths.map((_, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={`p${i}`}
                      name={`Path ${i + 1}`}
                      stroke={pathColors[i]?.color || '#64748b'}
                      strokeWidth={1.5}
                      strokeOpacity={pathColors[i]?.opacity || 0.4}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </section>

            {/* Bottom Grid: Stats Table + Asset Contributions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Statistics Table */}
              <section className="glass-card p-5 sm:p-6 animate-slide-up" style={{ animationDelay: '500ms' }}>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
                  Portfolio Statistics
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Mean', fmtCurrencyFull(result.metrics.mean_value)],
                      ['Median', fmtCurrencyFull(result.metrics.median_value)],
                      ['Std Deviation', fmtCurrencyFull(result.metrics.std_dev)],
                      ['Minimum', fmtCurrencyFull(result.metrics.min_value)],
                      ['Maximum', fmtCurrencyFull(result.metrics.max_value)],
                    ].map(([label, value], i) => (
                      <tr key={label} className={i % 2 === 0 ? 'bg-slate-800/20' : ''}>
                        <td className="py-2 px-3 text-slate-400 rounded-l-lg">{label}</td>
                        <td className="py-2 px-3 text-right font-mono-num text-slate-200 rounded-r-lg">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-5 mb-3">Percentiles</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-1 px-3">Percentile</th>
                      <th className="text-right py-1 px-3">Value</th>
                      <th className="text-right py-1 px-3">vs Initial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['5th', result.metrics.percentiles.p5],
                      ['25th', result.metrics.percentiles.p25],
                      ['50th', result.metrics.percentiles.p50],
                      ['75th', result.metrics.percentiles.p75],
                      ['95th', result.metrics.percentiles.p95],
                    ].map(([label, value], i) => {
                      const diff = value - result.metrics.initial_investment;
                      const diffPct = (diff / result.metrics.initial_investment * 100).toFixed(2);
                      return (
                        <tr key={label} className={i % 2 === 0 ? 'bg-slate-800/20' : ''}>
                          <td className="py-2 px-3 text-slate-400 rounded-l-lg">{label}</td>
                          <td className="py-2 px-3 text-right font-mono-num text-slate-200">{fmtCurrencyFull(value)}</td>
                          <td className={`py-2 px-3 text-right font-mono-num rounded-r-lg ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {diff >= 0 ? '+' : ''}{diffPct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {/* Asset Risk Contribution */}
              <section className="glass-card p-5 sm:p-6 animate-slide-up" style={{ animationDelay: '600ms' }}>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
                  Asset Contributions
                </h3>
                <div className="space-y-5">
                  {result.asset_contributions.map((asset, i) => (
                    <div key={asset.name} className="animate-fade-in" style={{ animationDelay: `${600 + i * 80}ms` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: ASSET_COLORS[i % ASSET_COLORS.length] }}
                          />
                          <span className="text-sm text-slate-300 font-medium">{asset.name}</span>
                        </div>
                      </div>

                      {/* Return contribution */}
                      <div className="mb-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span>Return Contribution</span>
                          <span className="font-mono-num text-emerald-400">{fmtPct(asset.mean_return_pct)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(asset.mean_return_pct, 100)}%`,
                              background: `linear-gradient(90deg, ${ASSET_COLORS[i % ASSET_COLORS.length]}, ${ASSET_COLORS[i % ASSET_COLORS.length]}88)`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Risk contribution */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span>Risk Contribution</span>
                          <span className="font-mono-num text-rose-400">{fmtPct(asset.risk_contribution_pct)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(asset.risk_contribution_pct, 100)}%`,
                              background: 'linear-gradient(90deg, #f43f5e, #f43f5e88)',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary comparison */}
                <div className="mt-6 pt-4 border-t border-slate-700/30">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Contribution Summary</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500 uppercase mb-1">Top Return Driver</p>
                      <p className="text-sm font-semibold text-emerald-400">
                        {result.asset_contributions.reduce((a, b) => a.mean_return_pct > b.mean_return_pct ? a : b).name}
                      </p>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500 uppercase mb-1">Top Risk Driver</p>
                      <p className="text-sm font-semibold text-rose-400">
                        {result.asset_contributions.reduce((a, b) => a.risk_contribution_pct > b.risk_contribution_pct ? a : b).name}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-slate-600 py-6 border-t border-slate-800/50">
        Portfolio Risk Analyzer · Monte Carlo Simulation with Geometric Brownian Motion · Built with FastAPI + React
      </footer>
    </div>
  );
}
