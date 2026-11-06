import {describe,expect,it} from "vitest";
import {calculateBridgeTakeoff,type BridgeTakeoffInputs} from "./bridgeTakeoff";
const base:BridgeTakeoffInputs={
 spanCount:2,spanLength:20,deckWidth:8,deckSlabThickness:0.25,wearingCourseThickness:0.08,
 girderCount:4,girderWidth:0.4,girderDepth:1.5,diaphragmCount:3,diaphragmWidth:0.25,diaphragmDepth:1,
 abutmentCount:2,abutmentLength:8,abutmentHeight:4,abutmentThickness:1,
 pierCount:1,pierCapLength:8,pierCapWidth:1.5,pierCapDepth:1,pierColumnsPerPier:2,pierColumnWidth:1,pierColumnDepth:1,pierColumnHeight:5,
 pileCount:8,pileDiameter:1,pileLength:15,rates:{concreteM3:10000,wearingCourseM3:15000}
};
describe("bridge geometric quantity takeoff",()=>{
 it("calculates deck slab and wearing-course quantities",()=>{
  const r=calculateBridgeTakeoff(base);
  expect(r.lines[0].quantity).toBe(80);
  expect(r.lines[7].quantity).toBe(25.6);
 });
 it("calculates girder, diaphragm, abutment and pier quantities",()=>{
  const r=calculateBridgeTakeoff(base);
  expect(r.lines[1].quantity).toBe(96);
  expect(r.lines[2].quantity).toBe(12);
  expect(r.lines[3].quantity).toBe(64);
  expect(r.lines[4].quantity).toBe(12);
  expect(r.lines[5].quantity).toBe(10);
 });
 it("calculates cylindrical pile concrete",()=>{
  const r=calculateBridgeTakeoff(base);
  expect(r.lines[6].quantity).toBe(94.248);
 });
 it("rejects invalid dimensions and fractional counts",()=>{
  expect(()=>calculateBridgeTakeoff({...base,deckWidth:-1})).toThrow(/non-negative/);
  expect(()=>calculateBridgeTakeoff({...base,pileCount:2.5})).toThrow(/whole number/);
 });
});
