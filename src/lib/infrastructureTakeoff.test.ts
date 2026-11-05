import {describe,expect,it} from "vitest";
import {calculateInfrastructureTakeoff,type InfrastructureInputs} from "./infrastructureTakeoff";
const base:InfrastructureInputs={
 roadLength:100,roadWidth:6,formationDepth:0.3,subbaseThickness:0.2,pavementThickness:0.05,
 drainLength:100,drainWidth:0.6,drainDepth:0.8,drainWallThickness:0.15,drainBaseThickness:0.15,
 culvertCount:1,culvertLength:8,culvertClearSpan:2,culvertClearRise:1.5,culvertWallThickness:0.25,culvertSlabThickness:0.25,
 rates:{earthworkM3:300,subbaseM3:1800,pavementM3:12000,drainConcreteM3:8500,culvertConcreteM3:9000}};
describe("road, drain and box culvert takeoff",()=>{
 it("calculates road earthwork, subbase and pavement volumes",()=>{
  const r=calculateInfrastructureTakeoff(base);
  expect(r.lines[0].quantity).toBe(180);
  expect(r.lines[1].quantity).toBe(120);
  expect(r.lines[2].quantity).toBe(30);
 });
 it("calculates side drain excavation and concrete lining",()=>{
  const r=calculateInfrastructureTakeoff(base);
  expect(r.lines[3].quantity).toBe(48);
  expect(r.lines[4].quantity).toBe(33);
 });
 it("calculates geometric box culvert barrel concrete",()=>{
  const r=calculateInfrastructureTakeoff(base);
  expect(r.lines[5].quantity).toBe(13);
 });
 it("rejects negative inputs and fractional culvert count",()=>{
  expect(()=>calculateInfrastructureTakeoff({...base,roadWidth:-1})).toThrow(/non-negative/);
  expect(()=>calculateInfrastructureTakeoff({...base,culvertCount:1.5})).toThrow(/whole number/);
 });
});
