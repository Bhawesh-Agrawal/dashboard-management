import { prisma } from "@/lib/prisma";
import { DEFAULT_CARD_ORDER, type BriefCardId } from "./payload-v2";

export interface BriefUserConfig {
  cardOrder: BriefCardId[];
  enabledCards: BriefCardId[];
  aiHeadline: boolean;
  includeAqi: boolean;
  middayEnabled: boolean;
  middayTime: string;
}

const VALID_CARD_IDS = new Set<string>(DEFAULT_CARD_ORDER);

export function getDefaultBriefUserConfig(): BriefUserConfig {
  return {
    cardOrder: [...DEFAULT_CARD_ORDER],
    enabledCards: [...DEFAULT_CARD_ORDER],
    aiHeadline: true,
    includeAqi: true,
    middayEnabled: false,
    middayTime: "13:00",
  };
}

export function parseBriefUserConfig(
  raw: unknown,
  middayPref?: { enabled: boolean; dailySummaryTime: string | null } | null
): BriefUserConfig {
  const defaults = getDefaultBriefUserConfig();
  const obj =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  const rawOrder = Array.isArray(obj.cardOrder)
    ? obj.cardOrder.filter((id): id is BriefCardId => typeof id === "string" && VALID_CARD_IDS.has(id))
    : [];
  const missingFromOrder = DEFAULT_CARD_ORDER.filter((id) => !rawOrder.includes(id));
  const cardOrder = rawOrder.length > 0 ? [...rawOrder, ...missingFromOrder] : defaults.cardOrder;

  const enabledCards = Array.isArray(obj.enabledCards)
    ? obj.enabledCards.filter((id): id is BriefCardId => typeof id === "string" && VALID_CARD_IDS.has(id))
    : defaults.enabledCards;

  return {
    cardOrder,
    enabledCards,
    aiHeadline: typeof obj.aiHeadline === "boolean" ? obj.aiHeadline : defaults.aiHeadline,
    includeAqi: typeof obj.includeAqi === "boolean" ? obj.includeAqi : defaults.includeAqi,
    middayEnabled: middayPref ? middayPref.enabled : defaults.middayEnabled,
    middayTime: middayPref?.dailySummaryTime ?? defaults.middayTime,
  };
}

export async function getBriefUserConfig(userId: string): Promise<BriefUserConfig> {
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: {
        userId,
        type: { in: ["morning_brief", "midday_brief"] },
      },
      select: {
        type: true,
        enabled: true,
        dailySummaryTime: true,
        briefConfig: true,
      },
    });
    const morning = prefs.find((p) => p.type === "morning_brief");
    const midday = prefs.find((p) => p.type === "midday_brief");
    return parseBriefUserConfig(morning?.briefConfig, midday ?? null);
  } catch {
    return getDefaultBriefUserConfig();
  }
}
