import {describe,expect,it} from "vitest";
import {calculatePlumbingTakeoff,type PlumbingInputs} from "./plumbingTakeoff";
const base:PlumbingInputs={occupants:5,litresPerPersonPerDay:135,storageDays:2,coldWaterPipeM:40,hotWaterPipeM:15,soilPipeM:18,wastePipeM:22,ventPipeM:12,elbows:20,tees:12,reducers:4,isolationValves:6,stopValves:8,floorTraps:5,cleanouts:3,waterClosets:3,basins:3,showers:2,kitchenSinks:1,laundryPoints:1,rates:{coldPipeM:150,hotPipeM:180,soilPipeM:220,wastePipeM:170,ventPipeM:120,fittingEach:35,valveEach:250,trapEach:180,cleanoutEach:220,tankLitre:2}};
describe("plumbing quantity takeoff",()=>{
 it("calculates daily demand, storage and fixture totals",()=>{const r=calculatePlumbingTakeoff(base);expect(r.dailyDemandLitres).toBe(675);expect(r.recommendedStorageLitres).toBe(1350);expect(r.fixtureCount).toBe(10);});
 it("creates measured pipe, fitting and tank BOQ lines",()=>{const r=calculatePlumbingTakeoff(base);expect(r.lines).toHaveLength(13);expect(r.lines[0].quantity).toBe(40);expect(r.lines[12].quantity).toBe(1350);expect(r.total).toBeGreaterThan(0);});
 it("rejects negative, non-finite and fractional counts",()=>{expect(()=>calculatePlumbingTakeoff({...base,soilPipeM:-1})).toThrow(/non-negative/);expect(()=>calculatePlumbingTakeoff({...base,occupants:2.5})).toThrow(/whole numbers/);expect(()=>calculatePlumbingTakeoff({...base,rates:{...base.rates,trapEach:Number.NaN}})).toThrow(/finite/);});
});
