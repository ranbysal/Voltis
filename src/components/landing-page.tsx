import {
  ArrowRight,
  BarChart3,
  Check,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const FEATURES = [
  {
    icon: BarChart3,
    title: "One focused workspace",
    copy: "Dow and Nasdaq futures, multi-timeframe context, and live market structure in one view.",
  },
  {
    icon: Layers3,
    title: "Persistent fib layers",
    copy: "Build, compare, lock, and revisit buy and sell ideas without losing your chart state.",
  },
  {
    icon: ShieldCheck,
    title: "Deliberate execution",
    copy: "A private, gated workflow designed to keep analysis clear and every action intentional.",
  },
];

export function LandingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#eae9e7] text-[#111210]">
      <header className="mx-auto flex h-24 w-full max-w-[1480px] items-center px-6 sm:px-10 lg:px-14">
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="Voltis home"
        >
          <BrandMark />
          <span className="text-xl font-semibold tracking-[-0.045em]">
            Voltis
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] text-[#6e706b] sm:block">
            Private futures workspace
          </span>
          <Link
            href="/workspace"
            className="flex h-11 items-center gap-2 rounded-full bg-[#111210] px-5 text-[11px] font-medium text-white transition hover:bg-[#2b2d29]"
          >
            Open dashboard
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1480px] items-center gap-12 px-6 pb-20 pt-12 sm:px-10 lg:min-h-[calc(100dvh-96px)] lg:grid-cols-[0.78fr_1.22fr] lg:px-14 lg:pb-24 lg:pt-4">
        <div className="relative z-10 max-w-xl">
          <p className="mb-7 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#6f716c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#48b976]" />
            Built for calm, precise decisions
          </p>
          <h1 className="text-[clamp(4.6rem,9vw,8.75rem)] font-medium leading-[0.8] tracking-[-0.085em]">
            Trade
            <span className="block pl-[0.38em]">with clarity.</span>
          </h1>
          <p className="mt-9 max-w-md text-sm leading-7 text-[#656762]">
            A private CME futures workspace where market structure, persistent
            Fibonacci layers, journaling, and execution live together without
            the noise.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link
              href="/workspace"
              className="group flex h-14 items-center gap-4 rounded-full bg-[#111210] pl-6 pr-2 text-xs font-medium text-white transition hover:bg-[#2b2d29]"
            >
              Enter Voltis
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition group-hover:translate-x-0.5">
                <ArrowRight size={16} />
              </span>
            </Link>
            <div className="flex items-center gap-2 text-[11px] text-[#71736e]">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-[#cbcac6] bg-white/60">
                <Check size={12} />
              </span>
              Light and dark workspaces included
            </div>
          </div>

          <div className="mt-16 flex items-end gap-3">
            <span
              className="text-[26px] italic tracking-[-0.04em]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Yazan
            </span>
            <span className="pb-1 text-[9px] uppercase tracking-[0.18em] text-[#858782]">
              Personal trading system
            </span>
          </div>
        </div>

        <div className="relative lg:pl-10">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-white/60 blur-3xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-white/90 bg-[#f8f7f4] p-3 shadow-[0_38px_100px_rgba(32,34,30,0.18)] sm:p-5">
            <div className="rounded-[24px] border border-[#e4e3df] bg-[#fbfaf7]">
              <div className="flex h-16 items-center border-b border-[#e9e8e4] px-5 sm:px-7">
                <div className="flex items-center gap-2.5">
                  <BrandMark className="scale-75" />
                  <span className="text-sm font-semibold tracking-[-0.04em]">
                    Voltis
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#48b976]" />
                  <span className="font-mono text-[8px] text-[#7f817c]">
                    CME MARKET OPEN
                  </span>
                </div>
              </div>

              <div className="grid min-h-[480px] grid-cols-[56px_minmax(0,1fr)] sm:min-h-[560px] sm:grid-cols-[68px_minmax(0,1fr)_190px]">
                <div className="flex flex-col items-center gap-3 border-r border-[#ebeae6] py-5">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <span
                      key={item}
                      className={
                        item === 0
                          ? "h-9 w-9 rounded-xl bg-black"
                          : "h-9 w-9 rounded-xl border border-[#ebeae6] bg-white"
                      }
                    />
                  ))}
                </div>

                <div className="min-w-0 p-5 sm:p-7">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] text-[#8a8c87]">Overview</p>
                      <p className="mt-2 text-2xl font-medium tracking-[-0.05em]">
                        YM Futures
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-medium">50,588</p>
                      <p className="mt-1 font-mono text-[9px] text-[#42a86d]">
                        +0.14% SESSION
                      </p>
                    </div>
                  </div>

                  <div className="mt-7 flex gap-2">
                    {["30m", "1h", "4h", "1d"].map((label, index) => (
                      <span
                        key={label}
                        className={
                          index === 0
                            ? "rounded-lg bg-black px-3 py-2 font-mono text-[8px] text-white"
                            : "rounded-lg border border-[#e7e6e2] bg-white px-3 py-2 font-mono text-[8px] text-[#737570]"
                        }
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="relative mt-5 h-72 overflow-hidden rounded-2xl border border-[#e4e3df] bg-white sm:h-80">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#efefec_1px,transparent_1px),linear-gradient(to_bottom,#efefec_1px,transparent_1px)] bg-[size:54px_46px]" />
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 600 320"
                      fill="none"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M0 253C48 247 70 262 105 222C141 181 176 205 210 173C246 140 271 161 312 118C350 78 392 111 428 70C467 25 514 82 600 25"
                        stroke="#45b773"
                        strokeWidth="3"
                      />
                      <path
                        d="M0 253C48 247 70 262 105 222C141 181 176 205 210 173C246 140 271 161 312 118C350 78 392 111 428 70C467 25 514 82 600 25V320H0V253Z"
                        fill="url(#chart-fill)"
                      />
                      <path d="M0 205H600" stroke="#54b77d" strokeDasharray="5 6" />
                      <path d="M0 126H600" stroke="#bd6b70" strokeDasharray="5 6" />
                      <defs>
                        <linearGradient
                          id="chart-fill"
                          x1="300"
                          y1="20"
                          x2="300"
                          y2="320"
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop stopColor="#61c48a" stopOpacity=".22" />
                          <stop offset="1" stopColor="#61c48a" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <span className="absolute left-4 top-[34%] rounded bg-[#f8eeee] px-2 py-1 font-mono text-[8px] text-[#9d4a51]">
                      4H SELL 0.786
                    </span>
                    <span className="absolute bottom-[30%] left-4 rounded bg-[#edf7f0] px-2 py-1 font-mono text-[8px] text-[#2e8050]">
                      1D BUY 0.382
                    </span>
                  </div>
                </div>

                <div className="hidden border-l border-[#ebeae6] bg-[#f8f7f4] p-4 sm:block">
                  <p className="text-[10px] font-medium">Fib layers</p>
                  <p className="mt-1 text-[8px] text-[#8c8e89]">
                    Visible overlays
                  </p>
                  <div className="mt-5 space-y-2">
                    {[
                      ["4H", "SELL", "#bd6b70"],
                      ["1D", "BUY", "#45b773"],
                      ["1W", "BUY", "#74aa8a"],
                    ].map(([timeframe, side, color]) => (
                      <div
                        key={timeframe}
                        className="rounded-xl border border-[#e8e7e3] bg-white p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: color }}
                          />
                          <span className="font-mono text-[9px] font-semibold">
                            {timeframe}
                          </span>
                          <span className="ml-auto font-mono text-[7px] text-[#878984]">
                            {side}
                          </span>
                        </div>
                        <div className="mt-3 h-1 rounded-full bg-[#eeedea]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: timeframe === "4H" ? "72%" : "55%",
                              background: color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d8d7d3] bg-[#e3e2df]">
        <div className="mx-auto grid max-w-[1480px] gap-px border-x border-[#d4d3cf] bg-[#d4d3cf] sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, copy }) => (
            <article key={title} className="bg-[#e9e8e5] p-8 lg:p-10">
              <Icon size={18} />
              <h2 className="mt-8 text-sm font-medium">{title}</h2>
              <p className="mt-3 max-w-xs text-[11px] leading-5 text-[#747671]">
                {copy}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
