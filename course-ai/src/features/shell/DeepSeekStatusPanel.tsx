import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ipc } from "@/lib/ipc";
import { qk } from "@/lib/queryKeys";

/** deepseek-flash 定价（元/百万 token）：输入 0.3，输出 1.2。 */
const PRICE_IN_PER_M = 0.3;
const PRICE_OUT_PER_M = 1.2;

/** 峰谷时段：工作日 9-12、14-18 为高峰，其余（含周末）为平价。返回当前时段信息。 */
function peakInfo(now: Date): { isPeak: boolean; remainingMin: number; progress: number } {
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const minutes = now.getHours() * 60 + now.getMinutes();

  let isPeak = false;
  let startMin = 0;
  let endMin = 24 * 60;

  if (isWeekend) {
    // 周末全天平价
    isPeak = false;
    startMin = 0;
    endMin = 24 * 60;
  } else if (minutes >= 9 * 60 && minutes < 12 * 60) {
    isPeak = true;
    startMin = 9 * 60;
    endMin = 12 * 60;
  } else if (minutes >= 14 * 60 && minutes < 18 * 60) {
    isPeak = true;
    startMin = 14 * 60;
    endMin = 18 * 60;
  } else if (minutes < 9 * 60) {
    isPeak = false;
    startMin = 0;
    endMin = 9 * 60;
  } else if (minutes < 14 * 60) {
    isPeak = false;
    startMin = 12 * 60;
    endMin = 14 * 60;
  } else {
    isPeak = false;
    startMin = 18 * 60;
    endMin = 24 * 60;
  }

  const remainingMin = Math.max(0, endMin - minutes);
  const totalMin = Math.max(1, endMin - startMin);
  const progress = Math.min(1, Math.max(0, (minutes - startMin) / totalMin));
  return { isPeak, remainingMin, progress };
}

/** 分钟 →「X小时X分」。 */
function formatMinutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}小时${mm}分`;
  return `${mm}分`;
}

/**
 * 侧边栏底部 DeepSeek 状态面板，复刻 DSH：
 * 今日消费金额、余额、当前峰谷时段剩余时间 + 进度条。
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

  // 今日消费金额（token × 定价）
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
            className={`h-full rounded-full ${peak.isPeak ? "bg-red-400" : "bg-sky-400"}`}
            style={{ width: `${peak.progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums text-[10px] text-[var(--text-faint)]">
          {t("nav.remaining")} {formatMinutes(peak.remainingMin)}
        </span>
      </div>
    </div>
  );
}
