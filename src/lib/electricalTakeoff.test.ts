import {describe,expect,it} from "vitest";
import {calculateElectricalTakeoff,type ElectricalInputs} from "./electricalTakeoff";
const base:ElectricalInputs={lightPoints:12,fanPoints:5,socketPoints:10,acPoints:2,waterHeaterPoints:1,dedicatedAppliancePoints:2,lightingCableM:120,powerCableM:90,conduitM:150,earthCableM:80,distributionBoards:2,singlePoleBreakers:12,doublePoleBreakers:4,rcboUnits:3,switches:14,socketOutlets:10,ceilingFans:5,lightFixtures:12,earthingElectrodes:2,rates:{lightingCableM:45,powerCableM:80,conduitM:35,earthCableM:30,dbEach:6500,spBreakerEach:350,dpBreakerEach:850,rcboEach:1800,switchEach:180,socketEach:250,fanEach:2500,lightEach:650,earthElectrodeEach:1800}};
describe("electrical takeoff",()=>{
 it("totals points and preliminary connected load",()=>{const r=calculateElectricalTakeoff(base);expect(r.totalPoints).toBe(32);expect(r.estimatedConnectedLoadKw).toBe(8.62);});
 it("creates a complete priced BOQ",()=>{const r=calculateElectricalTakeoff(base);expect(r.lines).toHaveLength(13);expect(r.lines[0].quantity).toBe(120);expect(r.total).toBeGreaterThan(0);});
 it("rejects negative, non-finite and fractional quantities",()=>{expect(()=>calculateElectricalTakeoff({...base,conduitM:-1})).toThrow(/non-negative/);expect(()=>calculateElectricalTakeoff({...base,lightPoints:2.5})).toThrow(/whole numbers/);expect(()=>calculateElectricalTakeoff({...base,rates:{...base.rates,dbEach:Number.NaN}})).toThrow(/finite/);});
});
