export type BridgeTakeoffInputs = {
  spanCount:number; spanLength:number; deckWidth:number; deckSlabThickness:number; wearingCourseThickness:number;
  girderCount:number; girderWidth:number; girderDepth:number;
  diaphragmCount:number; diaphragmWidth:number; diaphragmDepth:number;
  abutmentCount:number; abutmentLength:number; abutmentHeight:number; abutmentThickness:number;
  pierCount:number; pierCapLength:number; pierCapWidth:number; pierCapDepth:number;
  pierColumnsPerPier:number; pierColumnWidth:number; pierColumnDepth:number; pierColumnHeight:number;
  pileCount:number; pileDiameter:number; pileLength:number;
  rates:{concreteM3:number;wearingCourseM3:number};
};
export type BridgeBOQLine={code:string;description:string;quantity:number;unit:"m³";rate:number;amount:number;formula:string};
export type BridgeTakeoffResult={lines:BridgeBOQLine[];total:number};
const round=(n:number)=>Math.round(n*1000)/1000;
const validate=(n:number,label:string)=>{if(!Number.isFinite(n)||n<0)throw new Error(label+" must be a finite, non-negative number.");};
export function calculateBridgeTakeoff(i:BridgeTakeoffInputs):BridgeTakeoffResult{
 const fields:Array<[keyof Omit<BridgeTakeoffInputs,"rates">,string]>=[
 ["spanCount","Span count"],["spanLength","Span length"],["deckWidth","Deck width"],["deckSlabThickness","Deck slab thickness"],["wearingCourseThickness","Wearing course thickness"],
 ["girderCount","Girder count"],["girderWidth","Girder width"],["girderDepth","Girder depth"],["diaphragmCount","Diaphragm count"],["diaphragmWidth","Diaphragm width"],["diaphragmDepth","Diaphragm depth"],
 ["abutmentCount","Abutment count"],["abutmentLength","Abutment length"],["abutmentHeight","Abutment height"],["abutmentThickness","Abutment thickness"],
 ["pierCount","Pier count"],["pierCapLength","Pier cap length"],["pierCapWidth","Pier cap width"],["pierCapDepth","Pier cap depth"],["pierColumnsPerPier","Pier columns per pier"],["pierColumnWidth","Pier column width"],["pierColumnDepth","Pier column depth"],["pierColumnHeight","Pier column height"],
 ["pileCount","Pile count"],["pileDiameter","Pile diameter"],["pileLength","Pile length"]];
 for(const [key,label] of fields)validate(i[key],label);
 for(const key of ["spanCount","girderCount","diaphragmCount","abutmentCount","pierCount","pierColumnsPerPier","pileCount"] as const){if(!Number.isInteger(i[key]))throw new Error(key+" must be a whole number.");}
 validate(i.rates.concreteM3,"Concrete rate");validate(i.rates.wearingCourseM3,"Wearing-course rate");
 const deckArea=i.spanCount*i.spanLength*i.deckWidth;
 const concrete=[
  ["BR-DK-01","Deck slab concrete",deckArea*i.deckSlabThickness,"Span count × span length × deck width × slab thickness"],
  ["BR-GR-01","Longitudinal girder concrete",i.spanCount*i.girderCount*i.spanLength*i.girderWidth*i.girderDepth,"Span count × girders per span × span length × girder width × girder depth"],
  ["BR-DP-01","Diaphragm concrete",i.spanCount*i.diaphragmCount*i.deckWidth*i.diaphragmWidth*i.diaphragmDepth,"Span count × diaphragms per span × deck width × diaphragm width × diaphragm depth"],
  ["BR-AB-01","Abutment concrete (gross rectangular allowance)",i.abutmentCount*i.abutmentLength*i.abutmentHeight*i.abutmentThickness,"Abutment count × length × height × thickness"],
  ["BR-PC-01","Pier cap concrete",i.pierCount*i.pierCapLength*i.pierCapWidth*i.pierCapDepth,"Pier count × cap length × cap width × cap depth"],
  ["BR-PI-01","Pier column concrete",i.pierCount*i.pierColumnsPerPier*i.pierColumnWidth*i.pierColumnDepth*i.pierColumnHeight,"Pier count × columns per pier × column width × depth × height"],
  ["BR-PL-01","Bored pile concrete (cylindrical)",i.pileCount*Math.PI*(i.pileDiameter/2)**2*i.pileLength,"Pile count × π × (diameter ÷ 2)² × pile length"]
 ] as const;
 const rows:BridgeBOQLine[]=[
  ...concrete.map(([code,description,quantity,formula])=>({code,description,quantity:round(quantity),unit:"m³" as const,rate:i.rates.concreteM3,amount:round(quantity*i.rates.concreteM3),formula})),
  {code:"BR-WC-01",description:"Deck wearing course volume",quantity:round(deckArea*i.wearingCourseThickness),unit:"m³",rate:i.rates.wearingCourseM3,amount:round(deckArea*i.wearingCourseThickness*i.rates.wearingCourseM3),formula:"Total deck area × wearing-course thickness"}
 ];
 return {lines:rows,total:round(rows.reduce((sum,row)=>sum+row.amount,0))};
}
