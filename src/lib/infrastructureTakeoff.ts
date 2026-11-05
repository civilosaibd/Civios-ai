export type InfrastructureInputs = {
  roadLength: number; roadWidth: number; formationDepth: number;
  subbaseThickness: number; pavementThickness: number;
  drainLength: number; drainWidth: number; drainDepth: number; drainWallThickness: number; drainBaseThickness: number;
  culvertCount: number; culvertLength: number; culvertClearSpan: number; culvertClearRise: number; culvertWallThickness: number; culvertSlabThickness: number;
  rates: { earthworkM3: number; subbaseM3: number; pavementM3: number; drainConcreteM3: number; culvertConcreteM3: number };
};
export type InfrastructureLine = { code: string; description: string; quantity: number; unit: "m³" | "m²"; rate: number; amount: number; formula: string };
export type InfrastructureResult = { lines: InfrastructureLine[]; total: number };
const round=(v:number)=>Math.round(v*1000)/1000;
function validate(v:number,label:string){if(!Number.isFinite(v)||v<0)throw new Error(label+" must be a finite, non-negative number.");}
export function calculateInfrastructureTakeoff(i:InfrastructureInputs):InfrastructureResult{
 const keys: Array<[keyof Omit<InfrastructureInputs,"rates">,string]>=[
 ["roadLength","Road length"],["roadWidth","Road width"],["formationDepth","Formation depth"],["subbaseThickness","Subbase thickness"],["pavementThickness","Pavement thickness"],
 ["drainLength","Drain length"],["drainWidth","Drain width"],["drainDepth","Drain depth"],["drainWallThickness","Drain wall thickness"],["drainBaseThickness","Drain base thickness"],
 ["culvertCount","Culvert count"],["culvertLength","Culvert length"],["culvertClearSpan","Culvert clear span"],["culvertClearRise","Culvert clear rise"],["culvertWallThickness","Culvert wall thickness"],["culvertSlabThickness","Culvert slab thickness"]];
 for(const [k,label] of keys)validate(i[k],label);
 if(!Number.isInteger(i.culvertCount))throw new Error("Culvert count must be a whole number.");
 for(const [k,v] of Object.entries(i.rates))validate(v,k+" rate");
 const roadArea=i.roadLength*i.roadWidth;
 const excavation=roadArea*i.formationDepth;
 const subbase=roadArea*i.subbaseThickness;
 const pavement=roadArea*i.pavementThickness;
 const drainExcavation=i.drainLength*i.drainWidth*i.drainDepth;
 const drainConcrete=i.drainLength*(i.drainWidth*i.drainBaseThickness+2*i.drainWallThickness*i.drainDepth);
 const outerW=i.culvertClearSpan+2*i.culvertWallThickness;
 const outerH=i.culvertClearRise+2*i.culvertSlabThickness;
 const culvertConcrete=i.culvertCount*i.culvertLength*(outerW*outerH-i.culvertClearSpan*i.culvertClearRise);
 const rows:Array<Omit<InfrastructureLine,"amount">>=[
 {code:"RD-EW-01",description:"Road formation earthwork",quantity:round(excavation),unit:"m³",rate:i.rates.earthworkM3,formula:"Road length × width × formation depth"},
 {code:"RD-SB-01",description:"Granular subbase layer",quantity:round(subbase),unit:"m³",rate:i.rates.subbaseM3,formula:"Road length × width × subbase thickness"},
 {code:"RD-PV-01",description:"Pavement layer (volume)",quantity:round(pavement),unit:"m³",rate:i.rates.pavementM3,formula:"Road length × width × pavement thickness"},
 {code:"DR-EW-01",description:"Side drain excavation",quantity:round(drainExcavation),unit:"m³",rate:i.rates.earthworkM3,formula:"Drain length × excavation width × depth"},
 {code:"DR-C-01",description:"Side drain base and wall concrete",quantity:round(drainConcrete),unit:"m³",rate:i.rates.drainConcreteM3,formula:"L × (base width × base thickness + 2 × wall thickness × depth)"},
 {code:"CV-C-01",description:"Box culvert barrel concrete (geometric estimate)",quantity:round(culvertConcrete),unit:"m³",rate:i.rates.culvertConcreteM3,formula:"Count × length × (outer box area − clear opening area)"}];
 const lines=rows.map(x=>({...x,amount:round(x.quantity*x.rate)}));
 return {lines,total:round(lines.reduce((s,x)=>s+x.amount,0))};
}
