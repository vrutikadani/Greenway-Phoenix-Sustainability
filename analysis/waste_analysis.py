"""Phoenix waste tonnage analysis (2023) with a data-quality check.

Reads df23.csv (City of Phoenix landfill / transfer station tonnage, built by
stacking monthly open-data extracts), finds extracts that don't belong to 2023,
drops them, and writes a summary plus charts to images/.

    python analysis/waste_analysis.py            # uses ./df23.csv
    python analysis/waste_analysis.py path.csv
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images"
SITES = {"27": "27th Ave Transfer Station", "NG": "North Gateway Transfer Station", "SR": "SR-85 Landfill"}
LABELS = {"REFUSE": "Refuse", "RECYCLE": "Recycle", "GREEN": "Green waste", "LANDFILL": "Special (sludge, brine)"}
COLORS = {"REFUSE": "#355E3B", "RECYCLE": "#4C9AD8", "GREEN": "#8BC34A", "LANDFILL": "#B0A58C"}
INK, MUTED, GRID = "#1F2A24", "#6B7280", "#E5E7EB"


def load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["DateOut"])
    df = df.drop(columns=[c for c in df.columns if c.startswith("Unnamed")])
    # Each monthly extract restarts _id at 1, so a reset marks a new source file.
    df["extract"] = (df["_id"] == 1).cumsum()
    return df


def quality_check(df: pd.DataFrame, year: int = 2023) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (clean rows for `year`, one row per source extract with a keep/drop flag)."""
    ex = df.groupby("extract").agg(rows=("_id", "size"), first=("DateOut", "min"),
                                   last=("DateOut", "max"), tons=("NetSTN", "sum"))
    ex["keep"] = (ex["first"].dt.year == year) & (ex["last"].dt.year == year)
    clean = df[df["extract"].isin(ex.index[ex["keep"]])].copy()
    return clean, ex


def summarize(clean: pd.DataFrame) -> dict:
    total = clean["NetSTN"].sum()
    by_type = clean.groupby("MTGroup")["NetSTN"].sum().sort_values(ascending=False)
    monthly = clean.groupby(clean["DateOut"].dt.to_period("M"))["NetSTN"].sum()
    by_site = clean.groupby("SiteCode")["NetSTN"].sum().sort_values(ascending=False)
    by_customer = clean.groupby("BillCustomerType")["NetSTN"].sum().sort_values(ascending=False)
    return {"total": total, "by_type": by_type, "monthly": monthly,
            "by_site": by_site, "by_customer": by_customer}


def _style(ax, title: str, subtitle: str = ""):
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=MUTED, length=0)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_title(title, loc="left", fontsize=13, color=INK, fontweight="bold", pad=22)
    if subtitle:
        ax.text(0, 1.02, subtitle, transform=ax.transAxes, fontsize=9.5, color=MUTED)


def charts(s: dict, ex: pd.DataFrame) -> None:
    OUT.mkdir(exist_ok=True)

    # 1. Monthly tonnage (stacked by waste type)
    fig, ax = plt.subplots(figsize=(9, 4.2), dpi=150)
    m = s["monthly_by_type"]
    bottom = None
    for t in ["REFUSE", "RECYCLE", "GREEN", "LANDFILL"]:
        if t in m:
            vals = m[t] / 1000
            ax.bar(m.index.strftime("%b"), vals, bottom=bottom, color=COLORS[t], label=LABELS[t], width=0.65)
            bottom = vals if bottom is None else bottom + vals
    for x, v in zip(m.index.strftime("%b"), bottom):
        ax.text(x, v + 1.2, f"{v:.1f}K", ha="center", fontsize=8.5, color=INK)
    ax.set_ylabel("Tons (K)", color=MUTED)
    _style(ax, "Monthly tons received, Jan–Sep 2023", "Stacked by waste type · March and May peak near 99K tons, February lowest")
    ax.legend(frameon=False, ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.1), fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "monthly_tonnage.png")
    plt.close(fig)

    # 2. Waste mix (horizontal bars, share of total)
    fig, ax = plt.subplots(figsize=(9, 2.8), dpi=150)
    bt = s["by_type"]
    share = bt / bt.sum() * 100
    ax.barh([LABELS[t] for t in bt.index][::-1], share.values[::-1],
            color=[COLORS[t] for t in bt.index][::-1], height=0.6)
    for i, (t, v) in enumerate(zip(bt.index[::-1], share.values[::-1])):
        ax.text(v + 0.8, i, f"{v:.1f}%  ·  {bt[t]/1000:.1f}K tons", va="center", fontsize=9, color=INK)
    ax.set_xlim(0, 100)
    ax.grid(axis="x", color=GRID)
    ax.grid(axis="y", visible=False)
    _style(ax, "What Phoenix throws away", f"Share of {s['total']/1000:.1f}K tons received Jan–Sep 2023")
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    fig.savefig(OUT / "waste_mix.png")
    plt.close(fig)

    # 3. Data-quality chart: tons per source extract, dropped ones highlighted
    fig, ax = plt.subplots(figsize=(9, 3.4), dpi=150)
    labels = [f"{r['first']:%b %Y}" for _, r in ex.iterrows()]
    colors = ["#355E3B" if k else "#D9534F" for k in ex["keep"]]
    ax.bar(range(len(ex)), ex["tons"] / 1000, color=colors, width=0.65)
    ax.set_xticks(range(len(ex)), labels, rotation=0, fontsize=8)
    ax.set_ylabel("Tons (K)", color=MUTED)
    dropped = int((~ex["keep"]).sum())
    _style(ax, "Data check: 12 monthly files, 3 were the wrong year (shown in file order)",
           f"Red = {dropped} copies of Feb 2021 stacked into the 2023 file ({ex.loc[~ex['keep'], 'tons'].sum()/1000:.1f}K tons removed)")
    fig.tight_layout()
    fig.savefig(OUT / "data_quality.png")
    plt.close(fig)


def main(path: str | None = None) -> dict:
    df = load(Path(path) if path else ROOT / "df23.csv")
    clean, ex = quality_check(df)
    s = summarize(clean)
    s["monthly_by_type"] = (clean.groupby([clean["DateOut"].dt.to_period("M").dt.to_timestamp(), "MTGroup"])
                            ["NetSTN"].sum().unstack(fill_value=0))
    charts(s, ex)

    raw_total = df["NetSTN"].sum()
    print(f"Raw file: {len(df):,} rows, {raw_total/1000:.1f}K tons")
    print(f"Dropped {int((~ex['keep']).sum())} extracts dated outside 2023 "
          f"({len(df) - len(clean):,} rows, {(raw_total - s['total'])/1000:.1f}K tons)")
    print(f"Clean 2023 (Jan-Sep): {len(clean):,} rows, {s['total']/1000:.1f}K tons\n")
    print("Waste mix:")
    for t, v in s["by_type"].items():
        print(f"  {t:<9} {v/1000:>7.1f}K  {v/s['total']*100:5.1f}%")
    print("\nBy site:")
    for code, v in s["by_site"].items():
        print(f"  {SITES.get(str(code), code):<32} {v/1000:>7.1f}K")
    print("\nMonthly (K tons):", ", ".join(f"{p.strftime('%b')} {v/1000:.1f}" for p, v in s["monthly"].items()))
    print(f"\nCharts written to {OUT.relative_to(ROOT)}/")
    return s


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
