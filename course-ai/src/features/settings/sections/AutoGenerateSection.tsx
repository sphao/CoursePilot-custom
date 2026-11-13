import { useTranslation } from "react-i18next";
import { Switch } from "@/ui/switch";
import { Group, Row } from "@/features/settings/primitives";
import type { SettingsForm } from "@/features/settings/useSettingsForm";

/** 导入后自动生成哪些 AI 产物（关闭可省 token）。 */
export function AutoGenerateSection({ form }: { form: SettingsForm }) {
  const { t } = useTranslation();
  const { autoAiTasks, changeAutoAiTask } = form;

  const items = [
    { key: "chapters", labelKey: "settings.autoGen.chapters" },
    { key: "summary", labelKey: "settings.autoGen.summary" },
    { key: "notes", labelKey: "settings.autoGen.notes" },
    { key: "quiz", labelKey: "settings.autoGen.quiz" },
    { key: "mindmap", labelKey: "settings.autoGen.mindmap" },
  ] as const;

  return (
    <Group header={t("settings.autoGen.title")} hint={t("settings.autoGen.hint")}>
      {items.map((item) => (
        <Row
          key={item.key}
          label={t(item.labelKey)}
          htmlFor={`auto-${item.key}`}
        >
          <Switch
            id={`auto-${item.key}`}
            aria-label={t(item.labelKey)}
            checked={autoAiTasks[item.key]}
            onCheckedChange={(next) => void changeAutoAiTask(item.key, next)}
          />
        </Row>
      ))}
    </Group>
  );
}
