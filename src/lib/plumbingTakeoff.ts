export type PlumbingInputs={
 occupants:number;litresPerPersonPerDay:number;storageDays:number;
 coldWaterPipeM:number;hotWaterPipeM:number;soilPipeM:number;wastePipeM:number;ventPipeM:number;
 elbows:number;tees:number;reducers:number;isolationValves:number;stopValves:number;floorTraps:number;cleanouts:number;waterClosets:number;basins:number;showers:number;kitchenSinks:number;laundryPoints:number;
 rates:{coldPipeM:number;hotPipeM:number;soilPipeM:number;wastePipeM:number;ventPipeM:number;fittingEach:number;valveEach:number;trapEach:number;cleanoutEach:number;tankLitre:number};
};
export type PlumbingLine={code:string;description:string;quantity:number;unit:"m"|"pcs"|"L";rate:number;amount:number;formula:string};
export type PlumbingResult={lines:PlumbingLine[];total:number;dailyDemandLitres:number;recommendedStorageLitres:number;fixtureCount:number};
const round=(n:number)=>Math.round(n*100)/100;
const validate=(n:number,label:string)=>{if(!Number.isFinite(n)||n<0)throw new Error(label+" must be a finite, non-negative number.");};
export function calculatePlumbingTakeoff(i:PlumbingInputs):PlumbingResult{
 const fields:Array<[number,string]>=[
 [i.occupants,"Occupants"],[i.litresPerPersonPerDay,"Daily demand per person"],[i.storageDays,"Storage days"],
 [i.coldWaterPipeM,"Cold-water pipe length"],[i.hotWaterPipeM,"Hot-water pipe length"],[i.soilPipeM,"Soil pipe length"],[i.wastePipeM,"Waste pipe length"],[i.ventPipeM,"Vent pipe length"],
 [i.elbows,"Elbows"],[i.tees,"Tees"],[i.reducers,"Reducers"],[i.isolationValves,"Isolation valves"],[i.stopValves,"Stop valves"],[i.floorTraps,"Floor traps"],[i.cleanouts,"Cleanouts"],
 [i.waterClosets,"Water closets"],[i.basins,"Wash basins"],[i.showers,"Showers"],[i.kitchenSinks,"Kitchen sinks"],[i.laundryPoints,"Laundry points"],
 ...Object.entries(i.rates).map(([k,v])=>[v,"Rate "+k] as [number,string])
 ];
 fields.forEach(([v,label])=>validate(v,label));
 const counts=[i.occupants,i.elbows,i.tees,i.reducers,i.isolationValves,i.stopValves,i.floorTraps,i.cleanouts,i.waterClosets,i.basins,i.showers,i.kitchenSinks,i.laundryPoints];
 counts.forEach((v)=>{if(!Number.isInteger(v))throw new Error("Occupants, fixture and fitting counts must be whole numbers.");});
 const daily=i.occupants*i.litresPerPersonPerDay,storage=daily*i.storageDays;
 const fixtures=i.waterClosets+i.basins+i.showers+i.kitchenSinks+i.laundryPoints;
 const raw:Array<Omit<PlumbingLine,"amount">>=[
 ["PL-001","Cold-water supply pipe",i.coldWaterPipeM,"m",i.rates.coldPipeM,"Measured pipe route length"],
 ["PL-002","Hot-water supply pipe",i.hotWaterPipeM,"m",i.rates.hotPipeM,"Measured pipe route length"],
 ["PL-003","Soil pipe",i.soilPipeM,"m",i.rates.soilPipeM,"Measured soil-stack and branch length"],
 ["PL-004","Waste-water pipe",i.wastePipeM,"m",i.rates.wastePipeM,"Measured waste branch length"],
 ["PL-005","Vent pipe",i.ventPipeM,"m",i.rates.ventPipeM,"Measured vent route length"],
 ["PL-006","Elbows",i.elbows,"pcs",i.rates.fittingEach,"Count from coordinated plumbing drawings"],
 ["PL-007","Tees",i.tees,"pcs",i.rates.fittingEach,"Count from coordinated plumbing drawings"],
 ["PL-008","Reducers",i.reducers,"pcs",i.rates.fittingEach,"Count from coordinated plumbing drawings"],
 ["PL-009","Isolation valves",i.isolationValves,"pcs",i.rates.valveEach,"Count from valve schedule"],
 ["PL-010","Stop valves",i.stopValves,"pcs",i.rates.valveEach,"Count from fixture/valve schedule"],
 ["PL-011","Floor traps",i.floorTraps,"pcs",i.rates.trapEach,"Count from sanitary layout"],
 ["PL-012","Cleanouts",i.cleanouts,"pcs",i.rates.cleanoutEach,"Count from drainage layout"],
 ["PL-013","Water storage tank allowance",round(storage),"L",i.rates.tankLitre,"Occupants × daily litres/person × storage days"]
 ];
 const lines=raw.map(([code,description,quantity,unit,rate,formula])=>({code,description,quantity:round(quantity),unit,rate,amount:round(quantity*rate),formula}));
 return {lines,total:round(lines.reduce((s,l)=>s+l.amount,0)),dailyDemandLitres:round(daily),recommendedStorageLitres:round(storage),fixtureCount:fixtures};
}
