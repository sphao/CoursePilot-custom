import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ipc } from "@/lib/ipc";
import { qk } from "@/lib/queryKeys";

/** 判断当前是否处于高峰时段（DeepSeek 官方：工作日 9-12、14-18 高峰，其余含周末平价）。 */
function computePeak(now: Date): { isPeak: boolean; position: number } {
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const h = now.getHours() + now.getMinutes() / 60;
  const isPeak = !isWeekend && ((h >= 9 && h < 12) || (h >= 14 && h < 18));
  return { isPeak, position: h / 24 };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * 侧边栏底部的 DeepSeek 状态面板，复刻 DSH「账号与余额」：
 * 余额卡片（赠金 + 充值余额 + 充值入口）、今日用量、峰谷时段时间轴。
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
  const bal = balance.data;
  const totalTokens = (usage.data ?? []).reduce(
    (sum, u) => sum + u.prompt_tokens + u.completion_tokens,
    0,
  );

  return (
    <div className="flex flex-col gap-2 px-3 py-2 text-xs" role="status">
      {/* 余额卡片：复刻 DSH balanceCard（赠金 + 充值余额 + 充值入口） */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-faint)]">
          <span>{t("nav.deepseekAccount")}</span>
        </div>
        {bal ? (
          <>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-[var(--text-faint)]">{t("nav.grantedBalance")}</span>
              <span className="tabular-nums text-base font-semibold text-[var(--text-strong)]">
                ¥{bal.grantedBalance}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-[var(--text-faint)]">{t("nav.toppedUpBalance")}</span>
              <span className="tabular-nums text-base font-semibold text-[var(--text-strong)]">
                ¥{bal.toppedUpBalance}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-1.5">
              <span className="text-[11px] text-[var(--text-faint)]">{t("nav.totalBalance")}</span>
              <span className="tabular-nums font-medium text-[var(--text-strong)]">
                ¥{bal.totalBalance}
              </span>
            </div>
          </>
        ) : (
          <div className="mt-1 text-[var(--text-faint)]">{t("nav.balanceUnavailable")}</div>
        )}
        <a
          href="https://platform.deepseek.com/top_up"
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex h-7 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[11px] text-[var(--text-strong)] no-underline hover:bg-[var(--surface-card-hover)]"
        >
          {t("nav.topUp")}
        </a>
      </div>

      {/* 今日用量 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--text-faint)]">{t("nav.deepseekToday")}</span>
        <span className="tabular-nums text-[var(--text-strong)]">{formatTokens(totalTokens)} tok</span>
      </div>

      {/* 峰谷时段时间轴（0-24h，高峰区间高亮，白点=当前时间） */}
      <div>
        <div className="flex items-center justify-between text-[10px] leading-none">
          <span className={peak.isPeak ? "font-medium text-[var(--status-err)]" : "font-medium text-emerald-500"}>
            {peak.isPeak ? t("nav.peakHours") : t("nav.offPeakHours")}
          </span>
          <span className="text-[var(--text-faint)]">{t("nav.peakRange")}</span>
        </div>
        <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-card-hover)]">
          {/* 高峰区间 9-12 */}
          <div className="absolute top-0 h-full bg-red-400/60" style={{ left: "37.5%", width: "12.5%" }} />
          {/* 高峰区间 14-18 */}
          <div className="absolute top-0 h-full bg-red-400/60" style={{ left: "58.33%", width: "16.67%" }} />
          {/* 当前时间指针 */}
          <div
            className="absolute top-1/2 h-3 w-[3px] -translate-y-1/2 rounded-full bg-[var(--text-strong)] ring-1 ring-black/20"
            style={{ left: `calc(${peak.position * 100}% - 1px)` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-[var(--text-faint)]">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </div>
  );
}
