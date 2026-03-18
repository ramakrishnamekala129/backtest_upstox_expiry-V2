import datetime
import json
import os
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import norm


def bs_all(option_type: str, S: float, K: float, r: float, sigma: float, T: float):
    if T <= 0:
        if option_type == "call":
            price = max(0, S - K)
            delta = 1.0 if S > K else 0.0
        else:
            price = max(0, K - S)
            delta = -1.0 if S < K else 0.0
        return price, delta, 0.0, 0.0, 0.0

    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == "call":
        price = S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
        delta = norm.cdf(d1)
    else:
        price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta = -norm.cdf(-d1)

    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    if option_type == "call":
        theta = (
            -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
            - r * K * np.exp(-r * T) * norm.cdf(d2)
        )
    else:
        theta = (
            -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
            + r * K * np.exp(-r * T) * norm.cdf(-d2)
        )

    theta = theta / 252
    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    return price, delta, gamma, theta, vega


def bs_price(option_type: str, S: float, K: float, r: float, sigma: float, T: float) -> float:
    if T <= 0:
        return max(0, S - K) if option_type == "call" else max(0, K - S)

    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == "call":
        return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    return K * np.exp(-r * T) * norm.cdf(-d1) - S * norm.cdf(-d2)


def _pick_price_column(df: pd.DataFrame) -> Optional[str]:
    for col in ['ltp', 'last_price', 'close_price', 'market_price', 'price']:
        if col in df.columns:
            return col
    return None


def _resolve_custom_leg(
    leg: Dict,
    call_df: pd.DataFrame,
    put_df: pd.DataFrame,
    spot: float,
) -> Optional[Dict]:
    option_type = str(leg.get('option_type', '')).lower()
    side = str(leg.get('side', '')).lower()

    try:
        qty = float(leg.get('qty', 1))
    except (TypeError, ValueError):
        return None

    if option_type not in ['call', 'put'] or side not in ['buy', 'sell'] or qty <= 0:
        return None

    option_df = call_df if option_type == 'call' else put_df
    price_col = _pick_price_column(option_df)
    if price_col is None:
        return None

    strike_series = pd.to_numeric(option_df['strike'], errors='coerce').dropna().reset_index(drop=True)
    if strike_series.empty:
        return None

    strike = leg.get('strike')
    if strike is None:
        try:
            offset = float(leg.get('strike_offset', 0))
        except (TypeError, ValueError):
            offset = 0.0
        target_strike = float(spot) + offset
        nearest_idx = (strike_series - target_strike).abs().idxmin()
        strike = float(strike_series.iloc[nearest_idx])
    else:
        try:
            target_strike = float(strike)
        except (TypeError, ValueError):
            return None
        nearest_idx = (strike_series - target_strike).abs().idxmin()
        strike = float(strike_series.iloc[nearest_idx])

    rows = option_df[pd.to_numeric(option_df['strike'], errors='coerce') == strike]
    if rows.empty:
        return None

    market_premium = pd.to_numeric(rows.iloc[0][price_col], errors='coerce')
    premium_override = leg.get('premium')
    if premium_override is None:
        premium = float(market_premium) if pd.notna(market_premium) else None
    else:
        try:
            premium = float(premium_override)
        except (TypeError, ValueError):
            premium = None

    if premium is None:
        return None

    return {
        'option_type': option_type,
        'side': side,
        'qty': qty,
        'strike': strike,
        'premium': premium
    }


def resolve_legs_from_chain(
    custom_legs: Iterable[Dict],
    call_df: pd.DataFrame,
    put_df: pd.DataFrame,
    spot: float,
    iv_column_candidates: Sequence[str] = ('iv', 'implied_volatility'),
) -> List[Dict]:
    resolved_legs = []

    for leg in custom_legs:
        resolved = _resolve_custom_leg(leg, call_df, put_df, spot)
        if not resolved:
            continue

        df = call_df if resolved['option_type'] == 'call' else put_df
        row = df[df['strike'] == resolved['strike']]
        iv = 0.15
        if not row.empty:
            for col in iv_column_candidates:
                if col in row.columns:
                    raw_iv = float(row.iloc[0][col])
                    iv = raw_iv / 100 if raw_iv > 1 else raw_iv
                    break
        resolved['iv'] = iv
        resolved_legs.append(resolved)

    return resolved_legs


def _find_break_evens(x_values: Sequence[float], y_values: Sequence[float]) -> List[float]:
    break_evens: List[float] = []
    for i in range(len(y_values) - 1):
        y1 = y_values[i]
        y2 = y_values[i + 1]
        if y1 == 0:
            break_evens.append(float(x_values[i]))
        elif y1 * y2 < 0:
            x1 = x_values[i]
            x2 = x_values[i + 1]
            x_zero = x1 - y1 * (x2 - x1) / (y2 - y1)
            break_evens.append(float(x_zero))
    return break_evens


def professional_payoff_engine(
    resolved_legs: Sequence[Dict],
    spot: float,
    expiry_date: datetime.date,
    target_days: int = 3,
    iv_shift: float = 0.0,
    spot_shift: float = 0.0,
    r: float = 0.0,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Dict[str, float]]:
    today = datetime.date.today()
    days_to_expiry = max((expiry_date - today).days, 0)

    T_today = days_to_expiry / 365
    T_target = max((days_to_expiry - target_days), 0) / 365
    if T_target <= 0 and target_days < days_to_expiry:
        T_target = T_today

    spot_adj = spot * (1 + spot_shift)
    price_range = np.linspace(spot_adj * 0.92, spot_adj * 1.08, 100)

    expiry_curve = np.zeros_like(price_range)
    mtm_curve = np.zeros_like(price_range)

    portfolio_delta = portfolio_gamma = portfolio_theta = portfolio_vega = 0.0

    for leg in resolved_legs:
        K = leg['strike']
        premium = leg['premium']
        qty = leg['qty']
        side = leg['side']
        opt_type = leg['option_type']

        iv = max(leg.get('iv', 0.109) + iv_shift, 0.01)

        if opt_type == 'call':
            intrinsic = np.maximum(price_range - K, 0)
        else:
            intrinsic = np.maximum(K - price_range, 0)

        expiry_leg = (intrinsic - premium) * qty if side == 'buy' else (premium - intrinsic) * qty
        expiry_curve += expiry_leg

        mtm_leg = []
        for S in price_range:
            price, delta, gamma, theta, vega = bs_all(opt_type, S, K, r, iv, T_target)
            if side == 'buy':
                mtm_leg.append((price - premium) * qty)
            else:
                mtm_leg.append((premium - price) * qty)
        mtm_curve += np.array(mtm_leg)

        price, delta, gamma, theta, vega = bs_all(opt_type, spot_adj, K, r, iv, T_today)
        sign = 1 if side == 'buy' else -1
        portfolio_delta += delta * qty * sign
        portfolio_gamma += gamma * qty * sign
        portfolio_theta += theta * qty * sign
        portfolio_vega += vega * qty * sign

    greeks = {
        'Delta': portfolio_delta,
        'Gamma': portfolio_gamma,
        'Theta': portfolio_theta,
        'Vega': portfolio_vega,
    }

    return price_range, expiry_curve, mtm_curve, greeks


def plot_custom_payoff(
    call_df: pd.DataFrame,
    put_df: pd.DataFrame,
    chain_data: Sequence[Dict],
    expiry_date: datetime.date,
    custom_legs: Sequence[Dict],
    output_path: str = 'payoff_custom.png',
    target_days: int = 3,
) -> None:
    if call_df.empty or put_df.empty or not custom_legs:
        print('Plot skipped: missing data.')
        return

    spot = None
    if chain_data:
        spot = chain_data[0].get('underlying_spot_price')

    if spot is None:
        strikes = pd.concat([
            pd.to_numeric(call_df['strike'], errors='coerce'),
            pd.to_numeric(put_df['strike'], errors='coerce'),
        ]).dropna()
        spot = float(strikes.median())

    resolved_legs = [
        leg for leg in (
            _resolve_custom_leg(custom_leg, call_df, put_df, spot)
            for custom_leg in custom_legs
        )
        if leg
    ]

    if not resolved_legs:
        print('No valid legs.')
        return

    strikes_used = [leg['strike'] for leg in resolved_legs]
    low = min(spot * 0.85, min(strikes_used) * 0.9)
    high = max(spot * 1.15, max(strikes_used) * 1.1)
    underlying_prices = np.linspace(low, high, 50)

    expiry_payoff = np.zeros_like(underlying_prices)
    mtm_payoff = np.zeros_like(underlying_prices)

    today = datetime.date.today()
    days_to_expiry = max((expiry_date - today).days, 0)
    T_expiry = days_to_expiry / 365
    T_target = max((days_to_expiry - target_days), 0) / 365

    r = 0.0
    default_iv = 0.15

    for leg in resolved_legs:
        strike = leg['strike']
        premium = leg['premium']
        qty = leg['qty']
        option_type = leg['option_type']
        side = leg['side']

        df = call_df if option_type == 'call' else put_df
        row = df[df['strike'] == strike]
        raw_iv = default_iv * 100
        for col in ['iv', 'implied_volatility']:
            if col in row.columns:
                raw_iv_candidate = row.iloc[0][col]
                raw_iv = float(raw_iv_candidate) if pd.notna(raw_iv_candidate) else raw_iv
                break

        iv = raw_iv / 100 if raw_iv > 1 else raw_iv
        iv = max(min(iv, 1.5), 0.01)

        if option_type == 'call':
            intrinsic = np.maximum(underlying_prices - strike, 0)
        else:
            intrinsic = np.maximum(strike - underlying_prices, 0)

        expiry_leg = (intrinsic - premium) * qty if side == 'buy' else (premium - intrinsic) * qty
        expiry_payoff += expiry_leg

        theo_prices = np.array([
            bs_price(option_type, S, strike, r, iv, T_target)
            for S in underlying_prices
        ])

        mtm_leg = (theo_prices - premium) * qty if side == 'buy' else (premium - theo_prices) * qty
        mtm_payoff += mtm_leg

    break_evens = _find_break_evens(underlying_prices, expiry_payoff)

    plt.figure(figsize=(11, 6))
    plt.plot(underlying_prices, expiry_payoff, linewidth=2.5, color='green', label='Expiry Payoff')
    plt.plot(
        underlying_prices,
        mtm_payoff,
        linestyle='--',
        color='blue',
        linewidth=2,
        label=f'Target MTM (T-{target_days})',
    )
    plt.axhline(0, color='black', linestyle='--')
    plt.axvline(spot, color='gray', linestyle='--', label=f'Spot {spot:.0f}')
    for i, be in enumerate(break_evens):
        plt.axvline(be, color='red', linestyle=':', label='Break-even' if i == 0 else None)
    plt.title(f'NIFTY Custom Payoff ({expiry_date})')
    plt.xlabel('Underlying Price')
    plt.ylabel('Profit / Loss')
    plt.grid(alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.show()

    print(f"Saved to: {os.path.abspath(output_path)}")


def prop_desk_engine(
    resolved_legs: Sequence[Dict],
    spot: float,
    expiry_date: datetime.date,
    r: float = 0.0,
    iv_shift: float = 0.0,
    target_days: int = 0,
) -> Dict[str, float]:
    today = datetime.date.today()
    days_to_expiry = max((expiry_date - today).days, 0)
    T = max((days_to_expiry - target_days), 0) / 365

    portfolio_delta = portfolio_gamma = portfolio_theta = portfolio_vega = portfolio_value = 0.0

    for leg in resolved_legs:
        K = leg['strike']
        premium = leg['premium']
        qty = leg['qty']
        side = 1 if leg['side'] == 'buy' else -1
        opt_type = leg['option_type']

        iv = max(leg.get('iv', 0.1) + iv_shift, 0.01)
        price, delta, gamma, theta, vega = bs_all(opt_type, spot, K, r, iv, T)

        portfolio_value += (price - premium) * qty * side
        portfolio_delta += delta * qty * side
        portfolio_gamma += gamma * qty * side
        portfolio_theta += theta * qty * side
        portfolio_vega += vega * qty * side

    delta_exposure = portfolio_delta * spot
    vega_exposure = portfolio_vega * 0.01
    gamma_exposure = 0.5 * portfolio_gamma * (spot**2)

    return {
        'Position Value': portfolio_value,
        'Delta': portfolio_delta,
        'Gamma': portfolio_gamma,
        'Theta (per day)': portfolio_theta,
        'Vega': portfolio_vega,
        '? Delta Exposure / 1% move': delta_exposure * 0.01,
        '? Vega Exposure / 1% IV': vega_exposure,
        'Convexity Risk (Gamma ?)': gamma_exposure,
    }


def stress_test(resolved_legs: Sequence[Dict], spot: float, expiry_date: datetime.date) -> Dict[str, float]:
    shocks = [-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03]
    results: Dict[str, float] = {}

    for shock in shocks:
        shocked_spot = spot * (1 + shock)
        risk = prop_desk_engine(resolved_legs, shocked_spot, expiry_date)
        results[f"{shock*100:.0f}% move"] = risk['Position Value']

    return results


def monte_carlo_pop(resolved_legs: Sequence[Dict], spot: float, expiry_date: datetime.date, sims: int = 5000) -> Tuple[float, float]:
    today = datetime.date.today()
    days_to_expiry = max((expiry_date - today).days, 0)
    T = days_to_expiry / 365

    returns = [leg.get('iv', 0.15) for leg in resolved_legs]
    iv = float(np.mean(returns)) if returns else 0.15

    simulated_spots = spot * np.exp(
        (-0.5 * iv**2) * T + iv * np.sqrt(T) * np.random.randn(sims)
    )

    profits = []
    for S in simulated_spots:
        total = 0.0
        for leg in resolved_legs:
            K = leg['strike']
            premium = leg['premium']
            qty = leg['qty']
            side = 1 if leg['side'] == 'buy' else -1
            if leg['option_type'] == 'call':
                intrinsic = max(0, S - K)
            else:
                intrinsic = max(0, K - S)
            total += (intrinsic - premium) * qty * side
        profits.append(total)

    profits_arr = np.array(profits)
    pop = float(np.mean(profits_arr > 0))
    expected_value = float(np.mean(profits_arr))

    return pop, expected_value


def plot_professional(price_range: Sequence[float], expiry_curve: Sequence[float], mtm_curve: Sequence[float], spot: float, greeks: Dict[str, float]) -> None:
    plt.figure(figsize=(11, 6))
    plt.plot(price_range, expiry_curve, color='green', linewidth=2.5, label='Expiry')
    plt.plot(price_range, mtm_curve, linestyle='--', color='blue', linewidth=2, label='Target MTM')
    plt.axhline(0, color='black', linestyle='--')
    plt.axvline(spot, color='gray', linestyle='--', label=f"Spot {spot:.0f}")
    plt.title(' Option Payoff Engine')
    plt.xlabel('Underlying Price')
    plt.ylabel('Profit / Loss')
    plt.grid(alpha=0.3)
    plt.legend()
    plt.show()

    print('\nPortfolio Greeks:')
    for key, value in greeks.items():
        print(f"{key}: {value:.4f}")


def tabular_from_chain_payload(
    chain_payload: Dict,
    expiry_value: datetime.date,
    master_df: Optional[pd.DataFrame] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    dfr = pd.DataFrame(chain_payload['data'])
    call_opts = dfr['call_options'].apply(pd.Series)
    put_opts = dfr['put_options'].apply(pd.Series)

    base = dfr.drop(columns=['market_data', 'option_greeks'])
    call_df = pd.concat(
        [
            base,
            pd.json_normalize(call_opts['market_data']),
            pd.json_normalize(call_opts['option_greeks']),
        ],
        axis=1,
    )
    put_df = pd.concat(
        [
            base,
            pd.json_normalize(put_opts['market_data']),
            pd.json_normalize(put_opts['option_greeks']),
        ],
        axis=1,
    )

    if isinstance(master_df, pd.DataFrame) and not master_df.empty:
        merge_src = master_df[
            (master_df['instrument_type'] == 'OPTIDX') &
            (master_df['expiry'] == expiry_value)
        ][['instrument_key', 'tradingsymbol', 'strike']].copy()
        if not merge_src.empty:
            call_df = call_df.merge(merge_src, on='instrument_key', how='left')
            put_df = put_df.merge(merge_src, on='instrument_key', how='left')

    return call_df, put_df


def export_payoff_json(
    price_range: Sequence[float],
    expiry_curve: Sequence[float],
    mtm_curve: Sequence[float],
    greeks: Dict[str, float],
    resolved_legs: Sequence[Dict],
    spot: float,
    expiry_date: datetime.date,
    call_df: pd.DataFrame,
    put_df: pd.DataFrame,
    target_days: int = 3,
    option_chains_by_expiry: Optional[Dict[str, Tuple[pd.DataFrame, pd.DataFrame]]] = None,
    nifty_master_df: Optional[pd.DataFrame] = None,
    output_path: str = 'payoff_data.json',
) -> str:
    call_oi = []
    put_oi = []

    call_oi_col = next((col for col in ['oi', 'open_interest', 'OI'] if col in call_df.columns), None)
    put_oi_col = next((col for col in ['oi', 'open_interest', 'OI'] if col in put_df.columns), None)

    call_strikes = pd.to_numeric(call_df['strike'], errors='coerce')
    put_strikes = pd.to_numeric(put_df['strike'], errors='coerce')

    for p in price_range:
        if call_oi_col and not call_df.empty:
            idx = (call_strikes - p).abs().idxmin()
            nearest = call_strikes.loc[idx]
            call_oi.append(float(call_df.loc[idx, call_oi_col]) if pd.notna(call_df.loc[idx, call_oi_col]) and abs(nearest - p) < 100 else 0)
        else:
            call_oi.append(0)

        if put_oi_col and not put_df.empty:
            idx = (put_strikes - p).abs().idxmin()
            nearest = put_strikes.loc[idx]
            put_oi.append(float(put_df.loc[idx, put_oi_col]) if pd.notna(put_df.loc[idx, put_oi_col]) and abs(nearest - p) < 100 else 0)
        else:
            put_oi.append(0)

    break_evens = _find_break_evens(list(price_range), list(expiry_curve))

    avg_iv = np.mean([leg.get('iv', 0.15) for leg in resolved_legs])
    days_to_exp = max((expiry_date - datetime.date.today()).days, 0)
    daily_vol = avg_iv * spot * np.sqrt(1 / 365) if spot else 0
    sd_1 = daily_vol * np.sqrt(days_to_exp)

    sd_levels = {
        'minus_2sd': float(spot - 2 * sd_1),
        'minus_1sd': float(spot - sd_1),
        'plus_1sd': float(spot + sd_1),
        'plus_2sd': float(spot + 2 * sd_1),
        'sd_points': float(sd_1),
        'sd_pct': float(sd_1 / spot * 100) if spot else 0.0,
    }

    ep = np.array([float(x) for x in expiry_curve])
    max_profit = float(np.max(ep))
    max_loss = float(np.min(ep))
    max_profit_unlimited = bool(ep[-1] > ep[-2] or ep[0] > ep[1]) if len(ep) > 1 else False

    total_premium = 0.0
    for leg in resolved_legs:
        sign = 1 if leg['side'] == 'buy' else -1
        total_premium += leg['premium'] * leg['qty'] * sign

    reward_risk = abs(max_profit / max_loss) if max_loss != 0 else None
    funds_needed = max(total_premium, 0.0)
    margin_needed = abs(max_loss) if max_loss < 0 else 0.0
    margin_available = 0.0
    booked_pnl = 0.0

    T_pop = days_to_exp / 365
    if T_pop > 0 and break_evens:
        from scipy.stats import norm as norm_dist

        if len(break_evens) == 1:
            be = break_evens[0]
            d = (np.log(be / spot)) / (avg_iv * np.sqrt(T_pop)) if spot and avg_iv else 0
            pop = float(1 - norm_dist.cdf(d)) if ep[-1] > 0 else float(norm_dist.cdf(d))
        elif len(break_evens) == 2:
            be_lo, be_hi = sorted(break_evens)
            d_lo = (np.log(be_lo / spot)) / (avg_iv * np.sqrt(T_pop)) if spot and avg_iv else 0
            d_hi = (np.log(be_hi / spot)) / (avg_iv * np.sqrt(T_pop)) if spot and avg_iv else 0
            if ep[0] > 0:
                pop = float(norm_dist.cdf(d_lo) + (1 - norm_dist.cdf(d_hi)))
            else:
                pop = float(norm_dist.cdf(d_hi) - norm_dist.cdf(d_lo))
        else:
            pop = 0.5
    else:
        pop = 0.5

    spot_idx = int(np.argmin(np.abs(np.array(price_range) - spot))) if spot else 0
    projected_profit = float(mtm_curve[spot_idx]) if spot_idx < len(mtm_curve) else 0.0
    projected_pct = float(projected_profit / abs(total_premium) * 100) if total_premium != 0 else 0.0

    total_intrinsic = 0.0
    total_time_value = 0.0
    for leg in resolved_legs:
        K = leg['strike']
        intr = max(0, spot - K) if leg['option_type'] == 'call' else max(0, K - spot)
        tv = leg['premium'] - intr
        sign = 1 if leg['side'] == 'buy' else -1
        total_intrinsic += intr * leg['qty'] * sign
        total_time_value += tv * leg['qty'] * sign

    def _build_option_chain_rows(cdf: pd.DataFrame, pdf: pd.DataFrame) -> List[Dict[str, Optional[float]]]:
        c_strikes = pd.to_numeric(cdf['strike'], errors='coerce')
        p_strikes = pd.to_numeric(pdf['strike'], errors='coerce')
        strikes = sorted(set(c_strikes.dropna().astype(int).tolist() + p_strikes.dropna().astype(int).tolist()))
        rows = []
        for s in strikes:
            row: Dict[str, Optional[float]] = {'strike': int(s)}
            c_row = cdf[c_strikes == s]
            if not c_row.empty:
                for col in ['iv', 'implied_volatility']:
                    if col in c_row.columns:
                        val = c_row.iloc[0][col]
                        row['call_iv'] = float(val) if pd.notna(val) else None
                        break
                if 'ltp' in c_row.columns:
                    row['call_ltp'] = float(c_row.iloc[0]['ltp'])
                elif 'last_price' in c_row.columns:
                    row['call_ltp'] = float(c_row.iloc[0]['last_price'])
                if 'oi' in c_row.columns:
                    row['call_oi'] = float(c_row.iloc[0]['oi'])
                if 'delta' in c_row.columns:
                    row['call_delta'] = float(c_row.iloc[0]['delta'])

            p_row = pdf[p_strikes == s]
            if not p_row.empty:
                for col in ['iv', 'implied_volatility']:
                    if col in p_row.columns:
                        val = p_row.iloc[0][col]
                        row['put_iv'] = float(val) if pd.notna(val) else None
                        break
                if 'ltp' in p_row.columns:
                    row['put_ltp'] = float(p_row.iloc[0]['ltp'])
                elif 'last_price' in p_row.columns:
                    row['put_ltp'] = float(p_row.iloc[0]['last_price'])
                if 'oi' in p_row.columns:
                    row['put_oi'] = float(p_row.iloc[0]['oi'])
                if 'delta' in p_row.columns:
                    row['put_delta'] = float(p_row.iloc[0]['delta'])

            rows.append(row)
        return rows

    option_chain = _build_option_chain_rows(call_df, put_df)

    option_chain_by_expiry: Dict[str, List[Dict[str, Optional[float]]]] = {}
    if option_chains_by_expiry:
        for exp_key, pair in option_chains_by_expiry.items():
            try:
                c_df, p_df = pair
                option_chain_by_expiry[str(exp_key)] = _build_option_chain_rows(c_df, p_df)
            except Exception:
                continue
    if not option_chain_by_expiry:
        option_chain_by_expiry[str(expiry_date)] = option_chain

    def _build_futures_section(
        cd: pd.DataFrame,
        pd_: pd.DataFrame,
        spot_price: float,
        exp_date: datetime.date,
        instrument_df: Optional[pd.DataFrame],
    ) -> Dict[str, List[Dict[str, float]]]:
        today = datetime.date.today()
        real_rows: List[Dict[str, float]] = []
        if isinstance(instrument_df, pd.DataFrame) and not instrument_df.empty:
            fut_df = instrument_df[instrument_df['instrument_type'] == 'FUTIDX'].copy()
            if not fut_df.empty:
                fut_df = fut_df.sort_values('expiry').drop_duplicates(subset=['expiry'], keep='first')
                for _, row in fut_df.head(3).iterrows():
                    exp = row['expiry']
                    dte = max((exp - today).days, 0)
                    price = row.get('last_price', spot_price)
                    real_rows.append({
                        'expiry': str(exp),
                        'days_to_expiry': int(dte),
                        'price': float(price),
                    })
        if not real_rows:
            dte = max((exp_date - today).days, 0)
            real_rows = [{
                'expiry': str(exp_date),
                'days_to_expiry': int(dte),
                'price': float(spot_price),
            }]

        call_ltp_col = _pick_price_column(cd)
        put_ltp_col = _pick_price_column(pd_)
        if not call_ltp_col or not put_ltp_col:
            return {'real': real_rows, 'synthetic': []}

        cdf = cd.copy()
        pdf = pd_.copy()
        cdf['strike_num'] = pd.to_numeric(cdf['strike'], errors='coerce')
        pdf['strike_num'] = pd.to_numeric(pdf['strike'], errors='coerce')
        if cdf.empty or pdf.empty:
            return {'real': real_rows, 'synthetic': []}

        call_map: Dict[float, float] = {}
        for _, row in cdf.iterrows():
            s = float(row['strike_num'])
            if s not in call_map:
                call_map[s] = float(row[call_ltp_col])

        put_map: Dict[float, float] = {}
        for _, row in pdf.iterrows():
            s = float(row['strike_num'])
            if s not in put_map:
                put_map[s] = float(row[put_ltp_col])

        common_strikes = sorted(set(call_map) & set(put_map))
        if not common_strikes:
            return {'real': real_rows, 'synthetic': []}

        atm_idx = int(np.argmin(np.abs(np.array(common_strikes, dtype=float) - float(spot_price))))
        candidate_idxs = [atm_idx + offset for offset in [0, 1, 2, 3]]

        opt_src = instrument_df
        syn_expiries: List[datetime.date] = []
        if isinstance(opt_src, pd.DataFrame) and not opt_src.empty:
            opt_exp = sorted(
                opt_src[opt_src['instrument_type'] == 'OPTIDX']['expiry'].dropna().unique().tolist()
            )
            fut_exp = set(
                opt_src[opt_src['instrument_type'] == 'FUTIDX']['expiry'].dropna().unique().tolist()
            )
            syn_expiries = [d for d in opt_exp if d >= today and d not in fut_exp][:4]
        if not syn_expiries:
            syn_expiries = [exp_date for _ in range(4)]

        synthetic_rows: List[Dict[str, float]] = []
        for i, idx in enumerate(candidate_idxs):
            if idx < 0 or idx >= len(common_strikes):
                continue
            strike = float(common_strikes[idx])
            call_ltp = call_map[strike]
            put_ltp = put_map[strike]
            syn_price = strike + call_ltp - put_ltp
            syn_exp = syn_expiries[min(i, len(syn_expiries) - 1)]
            syn_dte = max((syn_exp - today).days, 0)
            synthetic_rows.append({
                'expiry': str(syn_exp),
                'days_to_expiry': int(syn_dte),
                'strike': strike,
                'price': float(syn_price),
                'call_ltp': call_ltp,
                'put_ltp': put_ltp,
                'weekly': True,
            })

        return {'real': real_rows, 'synthetic': synthetic_rows}

    futures_section = _build_futures_section(call_df, put_df, spot, expiry_date, nifty_master_df)

    legs_info = [
        {
            'option_type': leg['option_type'],
            'side': leg['side'],
            'strike': float(leg['strike']),
            'premium': float(leg['premium']),
            'qty': float(leg['qty']),
            'iv': float(leg.get('iv', 0.15)),
        }
        for leg in resolved_legs
    ]

    data: Dict[str, object] = {
        'spot': float(spot),
        'expiry_date': str(expiry_date),
        'target_days': target_days,
        'price_range': [float(x) for x in price_range],
        'expiry_payoff': [float(x) for x in expiry_curve],
        'target_payoff': [float(x) for x in mtm_curve],
        'call_oi': call_oi,
        'put_oi': put_oi,
        'greeks': {k: float(v) for k, v in greeks.items()},
        'break_evens': [float(x) for x in break_evens],
        'sd_levels': sd_levels,
        'legs': legs_info,
        'option_chain': option_chain,
        'iv_data': option_chain,
        'option_chain_by_expiry': option_chain_by_expiry,
        'max_profit': max_profit,
        'max_profit_unlimited': max_profit_unlimited,
        'max_loss': max_loss,
        'reward_risk': reward_risk,
        'total_premium': total_premium,
        'funds_needed': funds_needed,
        'margin_needed': margin_needed,
        'margin_available': margin_available,
        'booked_pnl': booked_pnl,
        'pop': pop,
        'projected_profit': projected_profit,
        'projected_pct': projected_pct,
        'time_value': total_time_value,
        'intrinsic_value': total_intrinsic,
        'futures_section': futures_section,
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"? Payoff data exported to: {os.path.abspath(output_path)}")
    return output_path
