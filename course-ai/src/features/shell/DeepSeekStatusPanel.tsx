import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ipc } from "@/lib/ipc";
import { qk } from "@/lib/queryKeys";

/** deepseek-flash 定价（元/百万 token）：输入 0.3，输出 1.2。 */
const PRICE_IN_PER_M = 0.3;
const PRICE_OUT_PER_M = 1.2;

/** 判断当前是否处于高峰时段（工作日 9-12、14-18），返回当前小时位置 0-24。 */
function computePeak(now: Date): { isPeak: boolean; hour: number } {
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const h = now.getHours() + now.getMinutes() / 60;
  const isPeak = !isWeekend && ((h >= 9 && h < 12) || (h >= 14 && h < 18));
  return { isPeak, hour: h };
}

/** 把「天数」格式化成「X天X小时X分」。 */
function formatDuration(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "--";
  const totalMin = Math.round(days * 24 * 60);
  const d = Math.floor(totalMin / (24 * 60));
  const h = Math.floor((totalMin % (24 * 60)) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}天${h}小时${m}分`;
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分`;
}

/**
 * 侧边栏底部 DeepSeek 状态面板，复刻 DSH：
 * 今日消费金额、余额、余额可用进度条 + 剩余时间、峰谷时段时间轴。
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
  const peak = computePeak(now);

  // 今日消费金额（token × 定价）
  const todayCost = (usage.data ?? []).reduce((sum, u) => {
    return (
      sum +
      (u.prompt_tokens / 1_000_000) * PRICE_IN_PER_M +
      (u.completion_tokens / 1_000_000) * PRICE_OUT_PER_M
    );
  }, 0);

  const totalBalance = balance.data ? Number(balance.data.totalBalance) : null;
  // 余额可用天数预估 = 余额 ÷ 今日消费速率
  const daysLeft =
    totalBalance != null && todayCost > 0 ? totalBalance / todayCost : null;
  // 进度条：今日消费占「今日 + 余额」的比例（消耗速度视觉化）
  const burnRatio =
    totalBalance != null && totalBalance + todayCost > 0
      ? Math.min(1, todayCost / (totalBalance + todayCost))
      : 0;

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

      {/* 余额可用进度条 + 剩余时间 */}
      <div className="flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-card-hover)]">
          <div
            className="h-full rounded-full bg-sky-400"
            style={{ width: `${burnRatio * 100}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums text-[10px] text-[var(--text-faint)]">
          {t("nav.remaining")} {formatDuration(daysLeft ?? 0)}
        </span>
      </div>

      {/* 峰谷时段时间轴 */}
      <div>
        <div className="flex items-center justify-between text-[10px] leading-none">
          <span className={peak.isPeak ? "font-medium text-[var(--status-err)]" : "font-medium text-emerald-500"}>
            {peak.isPeak ? t("nav.peakHours") : t("nav.offPeakHours")}
          </span>
          <span className="text-[var(--text-faint)]">{t("nav.peakRange")}</span>
        </div>
        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-card-hover)]">
          {/* 高峰区间 9-12、14-18 */}
          <div className="absolute top-0 h-full bg-sky-400/50" style={{ left: "37.5%", width: "12.5%" }} />
          <div className="absolute top-0 h-full bg-sky-400/50" style={{ left: "58.33%", width: "16.67%" }} />
          {/* 当前时间指针 */}
          <div
            className="absolute top-1/2 h-2.5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--text-strong)]"
            style={{ left: `calc(${(peak.hour / 24) * 100}% - 1px)` }}
          />
        </div>
      </div>
    </div>
  );
}
