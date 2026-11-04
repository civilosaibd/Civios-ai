import { analyzePolygon, type PlotVertex } from "./landGeometry";

export type BuildingPlacementInput = {
  plot: PlotVertex[];
  width: number;
  depth: number;
  setback: number;
  angleStepDegrees?: number;
  gridStep?: number;
  maxCandidates?: number;
};
export type BuildingPlacement = {
  corners: PlotVertex[];
  center: PlotVertex;
  angleDegrees: number;
  area: number;
  minBoundaryClearance: number;
};
export type BuildingPlacementResult = {
  valid: boolean;
  reason?: string;
  placement: BuildingPlacement | null;
  candidatesChecked: number;
};

const EPS = 1e-8;
function cross(a:PlotVertex,b:PlotVertex,c:PlotVertex){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(a:PlotVertex,b:PlotVertex,p:PlotVertex){return Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;}
function intersects(a:PlotVertex,b:PlotVertex,c:PlotVertex,d:PlotVertex){
 const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
 if(((x1>EPS&&x2< -EPS)||(x1< -EPS&&x2>EPS))&&((x3>EPS&&x4< -EPS)||(x3< -EPS&&x4>EPS)))return true;
 return (Math.abs(x1)<EPS&&onSegment(a,b,c))||(Math.abs(x2)<EPS&&onSegment(a,b,d))||(Math.abs(x3)<EPS&&onSegment(c,d,a))||(Math.abs(x4)<EPS&&onSegment(c,d,b));
}
function inside(p:PlotVertex,poly:PlotVertex[]){
 let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if(onSegment(a,b,p))return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
 }
 return hit;
}
function distanceToSegment(p:PlotVertex,a:PlotVertex,b:PlotVertex){
 const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
 const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
 return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
}
function clearance(p:PlotVertex,poly:PlotVertex[]){
 let d=Infinity;
 for(let i=0;i<poly.length;i++)d=Math.min(d,distanceToSegment(p,poly[i],poly[(i+1)%poly.length]));
 return d;
}
function makeCorners(center:PlotVertex,w:number,h:number,angle:number){
 const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>({x:center.x+x*c-y*s,y:center.y+x*s+y*c}));
}
function fits(corners:PlotVertex[],plot:PlotVertex[],setback:number){
 if(!corners.every(p=>inside(p,plot)&&clearance(p,plot)>=setback-EPS))return false;
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4];
  for(let j=0;j<plot.length;j++)if(intersects(a,b,plot[j],plot[(j+1)%plot.length]))return false;
 }
 return true;
}

/** Grid-searches a rectangular footprint wholly inside the surveyed polygon and at least setback from its boundary. */
export function findBuildingPlacement(input:BuildingPlacementInput):BuildingPlacementResult{
 const {plot,width,depth,setback}=input;
 if(!analyzePolygon(plot).valid)return {valid:false,reason:"A valid, non-self-intersecting surveyed plot boundary is required.",placement:null,candidatesChecked:0};
 if(!Number.isFinite(width)||!Number.isFinite(depth)||!Number.isFinite(setback)||width<=0||depth<=0||setback<0)return {valid:false,reason:"Enter positive building dimensions and a non-negative setback.",placement:null,candidatesChecked:0};
 const minX=Math.min(...plot.map(p=>p.x)),maxX=Math.max(...plot.map(p=>p.x));
 const minY=Math.min(...plot.map(p=>p.y)),maxY=Math.max(...plot.map(p=>p.y));
 const step=Math.max(input.gridStep??Math.min(width,depth)/8,0.1);
 const angleStep=Math.max(1,Math.min(90,input.angleStepDegrees??15));
 const max=input.maxCandidates??100000;
 let checked=0,best:BuildingPlacement|null=null;
 for(let angle=0;angle<180;angle+=angleStep){
  for(let y=minY+step/2;y<=maxY;y+=step){
   for(let x=minX+step/2;x<=maxX;x+=step){
    if(checked++>=max) return {valid:!!best,reason:best?undefined:"Search limit reached before a valid placement was found.",placement:best,candidatesChecked:checked};
    const center={x,y},corners=makeCorners(center,width,depth,angle);
    if(!fits(corners,plot,setback))continue;
    const minBoundaryClearance=Math.min(...corners.map((p,i)=>{const q=corners[(i+1)%4];return Math.min(...plot.map((edge,j)=>segmentDistance(p,q,edge,plot[(j+1)%plot.length])));}));
    const candidate={corners,center,angleDegrees:angle,area:width*depth,minBoundaryClearance};
    if(!best||candidate.minBoundaryClearance>best.minBoundaryClearance)best=candidate;
   }
  }
 }
 return {valid:!!best,reason:best?undefined:"No placement found for these dimensions and setback. Try a smaller footprint or review the plot coordinates.",placement:best,candidatesChecked:checked};
}
