"""
Portfolio Risk Analyzer — FastAPI Backend
==========================================
Monte Carlo simulation engine using Geometric Brownian Motion (GBM) to
estimate portfolio risk metrics (VaR, CVaR) and return distributions.
"""

from __future__ import annotations

from typing import Dict, List

import numpy as np
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pydantic Models — Request
# ---------------------------------------------------------------------------


class AssetInput(BaseModel):
    """Single asset definition inside the portfolio."""

    name: str = Field(..., examples=["US Equities"])
    allocation: float = Field(..., ge=0.0, le=1.0, description="Portfolio weight (0‒1)")
    annual_return: float = Field(..., description="Expected annualised return (e.g. 0.10 for 10%)")
    annual_volatility: float = Field(..., ge=0.0, description="Annualised volatility (e.g. 0.20 for 20%)")


class SimulationRequest(BaseModel):
    """Payload accepted by POST /api/simulate."""

    assets: List[AssetInput] = Field(..., min_length=1)
    initial_investment: float = Field(..., gt=0)
    time_horizon_years: float = Field(..., gt=0)
    num_simulations: int = Field(10_000, ge=100, le=1_000_000)
    confidence_level: float = Field(0.95, gt=0.0, lt=1.0)


# ---------------------------------------------------------------------------
# Pydantic Models — Response
# ---------------------------------------------------------------------------


class PercentileMetrics(BaseModel):
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float


class RiskMetrics(BaseModel):
    var: float
    cvar: float
    mean_value: float
    median_value: float
    std_dev: float
    min_value: float
    max_value: float
    percentiles: PercentileMetrics
    initial_investment: float
    confidence_level: float


class SamplePath(BaseModel):
    label: str
    values: List[float]


class AssetContribution(BaseModel):
    name: str
    mean_return_pct: float
    risk_contribution_pct: float


class SimulationResponse(BaseModel):
    metrics: RiskMetrics
    distribution: List[float]
    distribution_bins: List[float]
    sample_paths: List[SamplePath]
    asset_contributions: List[AssetContribution]


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Portfolio Risk Analyzer API",
    version="1.0.0",
    description="Monte Carlo simulation engine for portfolio risk analysis.",
)

# CORS — allow all origins for demo purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "message": "Portfolio Risk Analyzer API"}


# ---------------------------------------------------------------------------
# Core Simulation
# ---------------------------------------------------------------------------


def run_monte_carlo(req: SimulationRequest) -> SimulationResponse:
    """Run a vectorised Monte Carlo simulation using Geometric Brownian Motion.

    For each asset *i* the terminal value is computed as:

        S_i(T) = w_i · V_0 · exp((μ_i − 0.5·σ_i²)·T + σ_i·√T·Z_i)

    where Z_i ~ N(0, 1) and the draws are independent across assets.

    The portfolio value at the horizon is the sum across all assets:

        V(T) = Σ S_i(T)

    Parameters
    ----------
    req : SimulationRequest
        Validated request payload containing asset definitions,
        investment amount, time horizon, number of simulations,
        and the confidence level for VaR / CVaR.

    Returns
    -------
    SimulationResponse
        Risk metrics, histogram data, sample paths, and asset
        contribution breakdowns.
    """

    n_sims: int = req.num_simulations
    T: float = req.time_horizon_years
    V0: float = req.initial_investment
    n_assets: int = len(req.assets)

    rng = np.random.default_rng()

    # ── Asset parameter vectors (shape: n_assets) ─────────────────────────
    weights = np.array([a.allocation for a in req.assets])          # (n_assets,)
    mus = np.array([a.annual_return for a in req.assets])           # (n_assets,)
    sigmas = np.array([a.annual_volatility for a in req.assets])    # (n_assets,)

    # ── GBM terminal values — fully vectorised ────────────────────────────
    # Z has shape (n_sims, n_assets)
    Z: np.ndarray = rng.standard_normal((n_sims, n_assets))

    # Drift and diffusion terms (broadcast across simulations)
    drift = (mus - 0.5 * sigmas ** 2) * T                          # (n_assets,)
    diffusion = sigmas * np.sqrt(T)                                 # (n_assets,)

    # Terminal value per asset per simulation: (n_sims, n_assets)
    asset_terminal = (weights * V0) * np.exp(drift + diffusion * Z)

    # Portfolio terminal value: (n_sims,)
    portfolio_values: np.ndarray = asset_terminal.sum(axis=1)

    # ── Risk Metrics ──────────────────────────────────────────────────────
    alpha: float = 1.0 - req.confidence_level  # tail probability

    # Profit / Loss relative to initial investment (positive = gain)
    pnl: np.ndarray = portfolio_values - V0

    # VaR: the loss threshold at the given confidence level (reported as a
    # positive number representing the magnitude of potential loss)
    var_threshold: float = -float(np.percentile(pnl, 100 * alpha))

    # CVaR / Expected Shortfall: average loss in the worst α‑tail
    tail_losses: np.ndarray = pnl[pnl <= -var_threshold]
    cvar: float = -float(tail_losses.mean()) if len(tail_losses) > 0 else var_threshold

    percentile_values = np.percentile(portfolio_values, [5, 25, 50, 75, 95])

    metrics = RiskMetrics(
        var=round(var_threshold, 2),
        cvar=round(cvar, 2),
        mean_value=round(float(portfolio_values.mean()), 2),
        median_value=round(float(np.median(portfolio_values)), 2),
        std_dev=round(float(portfolio_values.std()), 2),
        min_value=round(float(portfolio_values.min()), 2),
        max_value=round(float(portfolio_values.max()), 2),
        percentiles=PercentileMetrics(
            p5=round(float(percentile_values[0]), 2),
            p25=round(float(percentile_values[1]), 2),
            p50=round(float(percentile_values[2]), 2),
            p75=round(float(percentile_values[3]), 2),
            p95=round(float(percentile_values[4]), 2),
        ),
        initial_investment=V0,
        confidence_level=req.confidence_level,
    )

    # ── Distribution Histogram (200 bins) ─────────────────────────────────
    hist_counts, hist_edges = np.histogram(portfolio_values, bins=200)
    distribution = [int(v) for v in hist_counts]
    distribution_bins = [round(float(e), 2) for e in hist_edges]

    # ── Sample Paths (15 representative trajectories) ─────────────────────
    # Sort simulations by terminal value to pick representative ones
    sorted_indices = np.argsort(portfolio_values)
    n_paths = 5
    worst_idx = sorted_indices[:n_paths]
    median_start = max(0, n_sims // 2 - n_paths // 2)
    median_idx = sorted_indices[median_start : median_start + n_paths]
    best_idx = sorted_indices[-n_paths:]
    selected_indices = np.concatenate([worst_idx, median_idx, best_idx])

    # Generate 50 intermediate time steps for the selected paths
    n_steps = 50
    dt = T / n_steps
    time_grid = np.arange(1, n_steps + 1) * dt  # (n_steps,)

    # Re‑simulate the selected paths with fine time steps
    # For each selected simulation we reuse the *same* terminal random draw
    # logic but generate a full path via cumulative sums.
    sample_paths: List[SamplePath] = []

    for path_idx, sim_idx in enumerate(selected_indices):
        # Draw fresh increments for this path (n_steps, n_assets)
        dZ = rng.standard_normal((n_steps, n_assets))
        cumulative_Z = np.cumsum(dZ, axis=0)  # (n_steps, n_assets)

        # GBM at each time step: S_i(t_k) = w_i·V0·exp(drift_k + diffusion_k)
        step_drift = (mus - 0.5 * sigmas ** 2) * time_grid[:, None]    # (n_steps, n_assets)
        step_diffusion = sigmas * np.sqrt(dt) * cumulative_Z            # (n_steps, n_assets)

        asset_paths = (weights * V0) * np.exp(step_drift + step_diffusion)  # (n_steps, n_assets)
        portfolio_path = asset_paths.sum(axis=1)                             # (n_steps,)

        # Prepend initial investment
        full_path = np.concatenate([[V0], portfolio_path])

        label = f"Path {path_idx + 1}"
        sample_paths.append(
            SamplePath(
                label=label,
                values=[round(float(v), 2) for v in full_path],
            )
        )

    # ── Asset Contributions ───────────────────────────────────────────────
    # Mean return contribution: each asset's share of total expected return
    asset_mean_returns = weights * mus  # weighted return per asset
    total_mean_return = asset_mean_returns.sum()

    # Risk contribution (variance‑based): Var(portfolio) ≈ Σ w_i²·σ_i²
    # (independence assumption → no covariance terms)
    asset_variances = (weights * sigmas) ** 2
    total_variance = asset_variances.sum()

    asset_contributions: List[AssetContribution] = []
    for i, asset in enumerate(req.assets):
        mean_return_pct = (
            round(float(asset_mean_returns[i] / total_mean_return * 100), 2)
            if total_mean_return != 0
            else 0.0
        )
        risk_contribution_pct = (
            round(float(asset_variances[i] / total_variance * 100), 2)
            if total_variance != 0
            else 0.0
        )
        asset_contributions.append(
            AssetContribution(
                name=asset.name,
                mean_return_pct=mean_return_pct,
                risk_contribution_pct=risk_contribution_pct,
            )
        )

    return SimulationResponse(
        metrics=metrics,
        distribution=distribution,
        distribution_bins=distribution_bins,
        sample_paths=sample_paths,
        asset_contributions=asset_contributions,
    )


# ---------------------------------------------------------------------------
# Simulation Endpoint
# ---------------------------------------------------------------------------


@app.post("/api/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest) -> SimulationResponse:
    """Accept portfolio parameters and return Monte Carlo risk analysis."""
    return run_monte_carlo(request)


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
