export type ElectricalInputs={
 lightPoints:number;fanPoints:number;socketPoints:number;acPoints:number;waterHeaterPoints:number;dedicatedAppliancePoints:number;
 lightingCableM:number;powerCableM:number;conduitM:number;earthCableM:number;
 distributionBoards:number;singlePoleBreakers:number;doublePoleBreakers:number;rcboUnits:number;switches:number;socketOutlets:number;ceilingFans:number;lightFixtures:number;earthingElectrodes:number;
 rates:{lightingCableM:number;powerCableM:number;conduitM:number;earthCableM:number;dbEach:number;spBreakerEach:number;dpBreakerEach:number;rcboEach:number;switchEach:number;socketEach:number;fanEach:number;lightEach:number;earthElectrodeEach:number};
};
export type ElectricalLine={code:string;description:string;quantity:number;unit:"m"|"points"|"pcs";rate:number;amount:number;formula:string};
export type ElectricalResult={lines:ElectricalLine[];total:number;totalPoints:number;estimatedConnectedLoadKw:number};
const round=(n:number)=>Math.round(n*100)/100;
const validate=(n:number,label:string)=>{if(!Number.isFinite(n)||n<0)throw new Error(label+" must be a finite, non-negative number.");};
export function calculateElectricalTakeoff(i:ElectricalInputs):ElectricalResult{
 const counts=[i.lightPoints,i.fanPoints,i.socketPoints,i.acPoints,i.waterHeaterPoints,i.dedicatedAppliancePoints,i.distributionBoards,i.singlePoleBreakers,i.doublePoleBreakers,i.rcboUnits,i.switches,i.socketOutlets,i.ceilingFans,i.lightFixtures,i.earthingElectrodes];
 counts.forEach((n)=>{validate(n,"Electrical quantity");if(!Number.isInteger(n))throw new Error("Point, equipment and device counts must be whole numbers.");});
 const lengths=[i.lightingCableM,i.powerCableM,i.conduitM,i.earthCableM];lengths.forEach(n=>validate(n,"Cable/conduit length"));
 Object.entries(i.rates).forEach(([k,v])=>validate(v,"Rate "+k));
 const points=i.lightPoints+i.fanPoints+i.socketPoints+i.acPoints+i.waterHeaterPoints+i.dedicatedAppliancePoints;
 const load=i.lightPoints*0.02+i.fanPoints*0.075+i.socketPoints*0.1+i.acPoints*1.5+i.waterHeaterPoints*2+i.dedicatedAppliancePoints*1;
 const raw:Array<Omit<ElectricalLine,"amount">>=[
 ["EL-001","Lighting cable",i.lightingCableM,"m",i.rates.lightingCableM,"Measured cable route length; conductor size not selected"],
 ["EL-002","Power cable",i.powerCableM,"m",i.rates.powerCableM,"Measured cable route length; conductor size not selected"],
 ["EL-003","Electrical conduit/trunking",i.conduitM,"m",i.rates.conduitM,"Measured conduit route length"],
 ["EL-004","Earthing conductor",i.earthCableM,"m",i.rates.earthCableM,"Measured protective-earth route length"],
 ["EL-005","Distribution boards",i.distributionBoards,"pcs",i.rates.dbEach,"Count from electrical layout"],
 ["EL-006","Single-pole breakers",i.singlePoleBreakers,"pcs",i.rates.spBreakerEach,"Count from panel schedule"],
 ["EL-007","Double-pole breakers",i.doublePoleBreakers,"pcs",i.rates.dpBreakerEach,"Count from panel schedule"],
 ["EL-008","RCBO/RCD protective devices",i.rcboUnits,"pcs",i.rates.rcboEach,"Count from protection schedule"],
 ["EL-009","Switches",i.switches,"pcs",i.rates.switchEach,"Count from lighting layout"],
 ["EL-010","Socket outlets",i.socketOutlets,"pcs",i.rates.socketEach,"Count from power layout"],
 ["EL-011","Ceiling fans",i.ceilingFans,"pcs",i.rates.fanEach,"Count from fixture schedule"],
 ["EL-012","Light fixtures",i.lightFixtures,"pcs",i.rates.lightEach,"Count from lighting schedule"],
 ["EL-013","Earthing electrodes",i.earthingElectrodes,"pcs",i.rates.earthElectrodeEach,"Count from earthing design"]
 ];
 const lines=raw.map(([code,description,quantity,unit,rate,formula])=>({code,description,quantity:round(quantity),unit,rate,amount:round(quantity*rate),formula}));
 return {lines,total:round(lines.reduce((s,l)=>s+l.amount,0)),totalPoints:points,estimatedConnectedLoadKw:round(load)};
}
