import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ipc } from "@/lib/ipc";
import { qk } from "@/lib/queryKeys";

/** deepseek-flash 定价（元/百万 token）：输入 0.3，输出 1.2。 */
const PRICE_IN_PER_M = 0.3;
const PRICE_OUT_PER_M = 1.2;

const DAY_MIN = 24 * 60;
const WEEK_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 一周内所有高峰段（绝对分钟）：周一~周五 9-12、14-18。 */
function buildPeaks(): Array<[number, number]> {
  const peaks: Array<[number, number]> = [];
  for (let d = 0; d < 5; d++) {
    const base = d * DAY_MIN;
    peaks.push([base + 9 * 60, base + 12 * 60]);
    peaks.push([base + 14 * 60, base + 18 * 60]);
  }
  return peaks;
}

/** 绝对分钟 →「周X HH:00」。 */
function peakLabel(absMin: number): string {
  const d = Math.floor(absMin / DAY_MIN);
  const m = absMin % DAY_MIN;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  return `${WEEK_NAMES[d % 7]} ${hh}:00`;
}

/**
 * 峰谷时段：工作日 9-12、14-18 为高峰，其余（含周末全天）为平价。
 * 平价时段的剩余时间跨天计算到下一个高峰开始（如周五晚 → 周一 09:00）。
 */
function peakInfo(now: Date): {
  isPeak: boolean;
  remainingMin: number;
  progress: number;
  nextPeakLabel: string;
} {
  const day = now.getDay();
  const curAbs =
    ((day + 6) % 7) * DAY_MIN + now.getHours() * 60 + now.getMinutes();
  const peaks = buildPeaks();

  // 当前是否落在某个高峰段
  let currentPeak: [number, number] | null = null;
  for (const seg of peaks) {
    if (curAbs >= seg[0] && curAbs < seg[1]) {
      currentPeak = seg;
      break;
    }
  }

  if (currentPeak) {
    const [s, e] = currentPeak;
    return {
      isPeak: true,
      remainingMin: e - curAbs,
      progress: (curAbs - s) / (e - s),
      nextPeakLabel: "",
    };
  }

  // 平价：上一个高峰结束（平价开始）→ 下一个高峰开始（平价结束）
  let prevEnd = -DAY_MIN;
  let nextStart = 7 * DAY_MIN + DAY_MIN; // 兜底：下下周一
  for (const [s, e] of peaks) {
    if (e <= curAbs) prevEnd = Math.max(prevEnd, e);
    if (s > curAbs) {
      nextStart = s;
      break;
    }
  }
  return {
    isPeak: false,
    remainingMin: nextStart - curAbs,
    progress: (curAbs - prevEnd) / (nextStart - prevEnd),
    nextPeakLabel: peakLabel(nextStart),
  };
}

/** 分钟 →「X天X小时X分」（跨天时带天）。 */
function formatDuration(min: number): string {
  const m = Math.round(min);
  const d = Math.floor(m / DAY_MIN);
  const h = Math.floor((m % DAY_MIN) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}天${h}小时${mm}分`;
  if (h > 0) return `${h}小时${mm}分`;
  return `${mm}分`;
}

/**
 * 侧边栏底部 DeepSeek 状态面板，复刻 DSH：
 * 今日消费金额、余额、当前峰谷时段剩余时间 + 进度条（下方标注转峰时）。
 */
export function DeepSeekStatusPanel() {
  const { t } = useTranslation();
  const balance = useQuery({
    queryKey: ["deepseek-balance"],
    queryFn: ipc.ai.deepseekBalance,
    refetchInterval: 60_000,
    retry: false,
  });
  const usage = useQuery({
    queryKey: qk.llmUsage(),
    queryFn: ipc.dev.llmUsage,
    refetchInterval: 60_000,
  });
  const now = new Date();
  const peak = peakInfo(now);

  const todayCost = (usage.data ?? []).reduce((sum, u) => {
    return (
      sum +
      (u.prompt_tokens / 1_000_000) * PRICE_IN_PER_M +
      (u.completion_tokens / 1_000_000) * PRICE_OUT_PER_M
    );
  }, 0);

  const totalBalance = balance.data ? Number(balance.data.totalBalance) : null;
  const money = (n: number | null) =>
    n == null ? "--" : n.toFixed(4).replace(/\.?0+$/, "");

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 text-xs" role="status">
      {/* 今日消费金额 */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[var(--text-faint)]">{t("nav.deepseekToday")}</span>
        <span className="tabular-nums font-medium text-[var(--text-strong)]">
          ¥{todayCost.toFixed(4)}
        </span>
      </div>

      {/* 余额 */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-[var(--text-faint)]">
          <span className="inline-block h-3 w-3 rounded-full bg-sky-400 align-middle" aria-hidden="true" />
          {t("nav.deepseekBalance")}
        </span>
        <span className="tabular-nums font-semibold text-[var(--text-strong)]">
          ¥{money(totalBalance)}
        </span>
      </div>

      {/* 当前峰谷时段剩余时间 + 进度条 */}
      <div className="flex items-center gap-2">
        <span className={peak.isPeak ? "shrink-0 font-medium text-[var(--status-err)]" : "shrink-0 font-medium text-emerald-500"}>
          {peak.isPeak ? t("nav.peakHours") : t("nav.offPeakHours")}
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-card-hover)]">
          <div
            className="h-full rounded-full bg-sky-400"
            style={{ width: `${peak.progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums text-[10px] text-[var(--text-faint)]">
          {t("nav.remaining")} {formatDuration(peak.remainingMin)}
        </span>
      </div>

      {/* 转峰时标注（平价时显示下一个高峰开始） */}
      {peak.nextPeakLabel && (
        <div className="-mt-1 text-right text-[10px] leading-none text-[var(--text-faint)]">
          {peak.nextPeakLabel} {t("nav.toPeak")}
        </div>
      )}
    </div>
  );
}
