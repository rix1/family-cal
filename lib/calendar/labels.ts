import { t } from "@/lib/i18n.ts";

const TYPE_LABEL_KEYS: Record<string, string> = {
  birthday: "calendar.type.birthday",
  memorial: "calendar.type.memorial",
  anniversary: "calendar.type.anniversary",
  holiday: "calendar.type.holiday",
  wedding: "calendar.type.wedding",
  baptism: "calendar.type.baptism",
  confirmation: "calendar.type.confirmation",
  other: "calendar.type.other",
};

export function typeLabel(type: string): string {
  const key = TYPE_LABEL_KEYS[type];
  return key ? t(key) : type;
}

export function occasionLabel(kind: string): string {
  if (kind === "wedding" || kind === "baptism" || kind === "confirmation") {
    return t(`eventKind.${kind}`);
  }
  return t("eventKind.generic");
}
