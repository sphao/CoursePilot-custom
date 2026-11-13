import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ipc } from "@/lib/ipc";
import { qk } from "@/lib/queryKeys";

/** 判断当前是否处于高峰时段（工作日 9-12、14-18），返回当前区间进度 0-1。 */
function computePeak(now: Date): { isPeak: boolean; progress: number } {
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const h = now.getHours() + now.getMinutes() / 60;
  const isPeak = !isWeekend && ((h >= 9 && h < 12) || (h >= 14 && h < 18));
  let progress: number;
  if (isPeak) {
    progress = h < 12 ? (h - 9) / 3 : (h - 14) / 4;
  } else if (h < 9) {
    progress = h / 9;
  } else if (h < 14) {
    progress = (h - 12) / 2;
  } else {
    progress = (h - 18) / 6;
  }
  return { isPeak, progress: Math.min(1, Math.max(0, progress)) };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 侧边栏底部的 DeepSeek 状态面板：余额 + 今日用量 + 峰谷时段进度条。 */
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
  const bal = balance.data;
  const totalTokens = (usage.data ?? []).reduce(
    (sum, u) => sum + u.prompt_tokens + u.completion_tokens,
    0,
  );

  return (
    <div className="px-3 py-2 text-xs" role="status">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--text-faint)]">{t("nav.deepseekBalance")}</span>
        <span className="tabular-nums font-medium text-[var(--text-strong)]">
          {bal ? `¥${bal.totalBalance}` : "--"}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[var(--text-faint)]">{t("nav.deepseekToday")}</span>
        <span className="tabular-nums text-[var(--text-strong)]">{formatTokens(totalTokens)} tok</span>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] leading-none">
          <span className={peak.isPeak ? "text-[var(--status-err)]" : "text-emerald-500"}>
            {peak.isPeak ? t("nav.peakHours") : t("nav.offPeakHours")}
          </span>
          <span className="text-[var(--text-faint)]">9-12 · 14-18</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-card-hover)]">
          <div
            className={`h-full rounded-full ${peak.isPeak ? "bg-[var(--status-err)]" : "bg-emerald-500"}`}
            style={{ width: `${peak.progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
