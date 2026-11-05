export type TakeoffInputs = {
  excavationLength: number;
  excavationWidth: number;
  excavationDepth: number;
  footingCount: number;
  footingLength: number;
  footingWidth: number;
  footingDepth: number;
  slabArea: number;
  slabThickness: number;
  wallLength: number;
  wallHeight: number;
  wallThickness: number;
  openingArea: number;
  plasterArea: number;
  floorArea: number;
  paintArea: number;
  steelKgPerM3: number;
  rates: {
    excavationM3: number;
    concreteM3: number;
    brickworkM3: number;
    plasterM2: number;
    flooringM2: number;
    paintingM2: number;
    steelKg: number;
  };
};

export type TakeoffLine = {
  code: string;
  description: string;
  quantity: number;
  unit: "m³" | "m²" | "kg";
  rate: number;
  amount: number;
  formula: string;
};

export type TakeoffResult = { lines: TakeoffLine[]; total: number };

const round = (value: number) => Math.round(value * 1000) / 1000;
const finiteNonNegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite, non-negative number.`);
};

export function calculateConstructionTakeoff(input: TakeoffInputs): TakeoffResult {
  const dimensionKeys: Array<[keyof Omit<TakeoffInputs, "rates">, string]> = [
    ["excavationLength", "Excavation length"], ["excavationWidth", "Excavation width"],
    ["excavationDepth", "Excavation depth"], ["footingCount", "Footing count"],
    ["footingLength", "Footing length"], ["footingWidth", "Footing width"],
    ["footingDepth", "Footing depth"], ["slabArea", "Slab area"],
    ["slabThickness", "Slab thickness"], ["wallLength", "Wall length"],
    ["wallHeight", "Wall height"], ["wallThickness", "Wall thickness"],
    ["openingArea", "Opening area"], ["plasterArea", "Plaster area"],
    ["floorArea", "Floor area"], ["paintArea", "Paint area"],
    ["steelKgPerM3", "Steel allowance"],
  ];
  for (const [key, label] of dimensionKeys) finiteNonNegative(input[key], label);
  if (!Number.isInteger(input.footingCount)) throw new Error("Footing count must be a whole number.");
  for (const [key, rate] of Object.entries(input.rates)) finiteNonNegative(rate, `${key} rate`);

  const excavation = input.excavationLength * input.excavationWidth * input.excavationDepth;
  const footingConcrete = input.footingCount * input.footingLength * input.footingWidth * input.footingDepth;
  const slabConcrete = input.slabArea * input.slabThickness;
  const concrete = footingConcrete + slabConcrete;
  const grossWall = input.wallLength * input.wallHeight * input.wallThickness;
  const netWall = Math.max(0, grossWall - input.openingArea * input.wallThickness);
  const steel = concrete * input.steelKgPerM3;
  const definitions: Array<Omit<TakeoffLine, "amount">> = [
    { code: "EW-001", description: "Excavation in foundation trenches", quantity: round(excavation), unit: "m³", rate: input.rates.excavationM3, formula: "L × W × D" },
    { code: "C-001", description: "In-situ concrete (footings + slab)", quantity: round(concrete), unit: "m³", rate: input.rates.concreteM3, formula: "N × footing L × W × D + slab area × thickness" },
    { code: "ST-001", description: "Indicative reinforcement allowance", quantity: round(steel), unit: "kg", rate: input.rates.steelKg, formula: "Concrete volume × editable kg/m³ allowance" },
    { code: "BW-001", description: "Net wall masonry volume", quantity: round(netWall), unit: "m³", rate: input.rates.brickworkM3, formula: "Wall L × H × T − opening area × wall T" },
    { code: "PL-001", description: "Plastering area (user measured)", quantity: round(input.plasterArea), unit: "m²", rate: input.rates.plasterM2, formula: "Measured plaster surface area" },
    { code: "FL-001", description: "Floor finish area (user measured)", quantity: round(input.floorArea), unit: "m²", rate: input.rates.flooringM2, formula: "Measured floor finish area" },
    { code: "PT-001", description: "Painting area (user measured)", quantity: round(input.paintArea), unit: "m²", rate: input.rates.paintingM2, formula: "Measured paint surface area" },
  ];
  const lines = definitions.map((line) => ({ ...line, amount: round(line.quantity * line.rate) }));
  return { lines, total: round(lines.reduce((sum, line) => sum + line.amount, 0)) };
}
