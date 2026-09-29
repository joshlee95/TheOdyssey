// 경제 — "1코인 = SRD 5.2 금화 1개"를 모든 세계의 공통 단위로 쓴다. 서버는 bit(0.01코인) 정수로 저장한다.
// 기술 수준 간 가격은 d20 Future Progress Level 규칙, 흥정 결과표와 호감도 배율은 우리 값(shared/data/economy.json).
import economy from "./data/economy.json" with { type: "json" };
import { tierOf } from "./affinity";

export type Tech = "primitive" | "medieval" | "industrial" | "modern" | "futuristic";
export const TECH_ORDER: Tech[] = ["primitive", "medieval", "industrial", "modern", "futuristic"];

export const toBits = (coin: number) => Math.round(coin * 100);
export const fromBits = (bits: number) => bits / 100;
export const STARTING_BITS = toBits(100);

type Flavor = { coin: string; dime: string; bit: string; note?: string };
export function currencyFlavor(islandId: string, tech: Tech): Flavor {
  const byIsland = economy.currency.flavor_by_island_examples as Record<string, Flavor>;
  return byIsland[islandId] ?? (economy.currency.flavor_by_tech as Record<string, Flavor>)[tech];
}

/** 화면에 보일 금액: "12.34코인" */
export const formatCoin = (bits: number) => `${fromBits(bits).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}코인`;

/** 섬보다 낮은 기술은 한 단계마다 ×0.5, 한 단계 높으면 ×5, 두 단계 이상 높으면 살 수 없다 */
export function crossTechMultiplier(item: Tech, island: Tech): number | null {
  const diff = TECH_ORDER.indexOf(item) - TECH_ORDER.indexOf(island);
  if (diff <= 0) return 0.5 ** -diff;
  if (diff === 1) return 5;
  return null;
}

const AFFINITY_MULT = economy.buying_and_selling.affinity_price_mult as unknown as Record<string, number | null>;
/** 상인의 호감도에 따른 가격 배율. 적대면 null(거래 거부) */
export function affinityMultiplier(value: number): number | null {
  return AFFINITY_MULT[tierOf(value).id] ?? null;
}

export type HaggleTier = { id: string; buy_mult: number | null; sell_mult: number | null; affinity: number };
const HAGGLE = economy.haggling.results as (HaggleTier & { when: string })[];

/** 흥정 결과 단계: 자연 20·1, DC 대비 ±5 */
export function haggleTier(d20: number, total: number, dc: number): HaggleTier {
  const pick = (id: string) => HAGGLE.find((h) => h.id === id)!;
  if (d20 === 20) return pick("crit_success");
  if (d20 === 1) return pick("crit_fail");
  if (total >= dc + 5) return pick("great_success");
  if (total >= dc) return pick("success");
  if (total <= dc - 5) return pick("bad_fail");
  return pick("fail");
}

export type SaleKind = "equipment" | "valuable" | "magic";
/** 판매가: 장비 50%(흥정해도 최대 65%), 보석·교역품 100%, 마법·이상 물건은 희귀도 가치 기준 절반 */
export function sellPrice(baseBits: number, kind: SaleKind, haggleSellMult?: number | null): number {
  if (kind === "valuable") return baseBits;
  const mult = Math.min(0.65, haggleSellMult ?? 0.5);
  return Math.round(baseBits * mult);
}

export function buyPrice(
  baseBits: number,
  opts: { itemTech: Tech; islandTech: Tech; merchantAffinity?: number; haggleBuyMult?: number | null; qty?: number },
): { bits: number | null; reason?: string; breakdown: string[] } {
  const breakdown: string[] = [];
  const tech = crossTechMultiplier(opts.itemTech, opts.islandTech);
  if (tech === null) return { bits: null, reason: "이 섬의 기술로는 만들 수 없는 물건이라 살 수 없어요", breakdown };
  if (tech !== 1) breakdown.push(`기술 수준 ×${tech}`);
  let mult = tech;
  if (opts.merchantAffinity !== undefined) {
    const aff = affinityMultiplier(opts.merchantAffinity);
    if (aff === null) return { bits: null, reason: "상인이 적대적이라 팔지 않아요", breakdown };
    if (aff !== 1) breakdown.push(`호감도 ×${aff}`);
    mult *= aff;
  }
  if (opts.haggleBuyMult) {
    if (opts.haggleBuyMult !== 1) breakdown.push(`흥정 ×${opts.haggleBuyMult}`);
    mult *= opts.haggleBuyMult;
  }
  const qty = opts.qty ?? 1;
  return { bits: Math.max(1, Math.round(baseBits * mult)) * qty, breakdown };
}

/** GM 프롬프트에 넣을 이 섬의 물가표 (섬마다 고정 → 캐시) */
export function priceSheet(islandId: string, tech: Tech): string {
  const f = currencyFlavor(islandId, tech);
  const col = economy.cost_of_living;
  const gear = (economy.gear_by_tech as Record<string, unknown>)[tech];
  return [
    `화폐: 1코인 = ${f.coin}, 0.1코인 = ${f.dime}, 0.01코인 = ${f.bit}${f.note ? ` (${f.note})` : ""}. 선원은 섬을 떠날 때 배에서 환전된다.`,
    `생활비/일: ${col.lifestyle_per_day.map((l) => `${l.ko} ${l.coin}`).join(", ")}`,
    `숙박/밤: ${Object.entries(col.inn_per_night).map(([k, v]) => `${k} ${v}`).join(", ")} · 식사: ${Object.entries(col.meal).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    `정보(설득·학식 판정): ${economy.information_and_bribes.gather_information.levels.map((l) => `${l.ko} DC${l.check_dc} ${l.cost_coin}코인`).join(", ")}`,
    `뇌물: ${Object.entries(economy.information_and_bribes.bribes_coin).map(([k, v]) => `${k} ${v}`).join(", ")} — ${economy.information_and_bribes.bribe_effect}`,
    `특수 서비스: ${economy.services.special_service_tiers.tiers.map((t) => `${t.coin}코인(${t.looks})`).join(" / ")}`,
    `마법·이상 물건 희귀도: ${economy.magic_and_anomaly_items.rarity.filter((r) => r.coin).map((r) => `${r.ko} ${r.coin}`).join(", ")}`,
    `이 섬 기술 수준(${tech})의 장비와 가격(코인): ${JSON.stringify(gear)}`,
    `상점 유형: ${(economy.shop_archetypes as { ko: string; looks: Record<string, string> }[]).map((s) => `${s.ko}(${s.looks[tech] ?? "-"})`).join(", ")}`,
  ].join("\n");
}
