import { describe, expect, it } from "vitest";
import { findBuildingPlacement } from "./buildingPlacement";
import { analyzePolygon, type PlotVertex } from "./landGeometry";

const rectangle:PlotVertex[]=[{x:0,y:0},{x:20,y:0},{x:20,y:16},{x:0,y:16}];

describe("findBuildingPlacement",()=>{
 it("finds a building footprint inside a rectangular plot with the required setback",()=>{
  const result=findBuildingPlacement({plot:rectangle,width:8,depth:10,setback:2,gridStep:0.5,angleStepDegrees:15});
  expect(result.valid).toBe(true);
  expect(result.placement).not.toBeNull();
  expect(result.placement!.area).toBe(80);
  expect(result.placement!.minBoundaryClearance).toBeGreaterThanOrEqual(2-1e-8);
  for(const corner of result.placement!.corners)expect(corner.x).toBeGreaterThanOrEqual(2-1e-8);
 });
 it("rejects a footprint that cannot fit within the plot and setback",()=>{
  const result=findBuildingPlacement({plot:rectangle,width:30,depth:25,setback:1});
  expect(result.valid).toBe(false);
  expect(result.placement).toBeNull();
 });
 it("finds a footprint in a concave polygon without crossing its inward notch",()=>{
  const concave:PlotVertex[]=[{x:0,y:0},{x:20,y:0},{x:20,y:8},{x:12,y:8},{x:12,y:16},{x:0,y:16}];
  const result=findBuildingPlacement({plot:concave,width:5,depth:5,setback:1,gridStep:0.5,angleStepDegrees:15});
  expect(result.valid).toBe(true);
  expect(result.placement).not.toBeNull();
  expect(analyzePolygon(concave).valid).toBe(true);
 });
 it("validates dimensions and setback",()=>{
  const result=findBuildingPlacement({plot:rectangle,width:0,depth:5,setback:-1});
  expect(result.valid).toBe(false);
  expect(result.reason).toMatch(/positive building dimensions/);
 });
});
