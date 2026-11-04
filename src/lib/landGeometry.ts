export type PlotVertex = { x: number; y: number };
export type PolygonAnalysis = {
  valid: boolean;
  errors: string[];
  area: number;
  perimeter: number;
  centroid: PlotVertex | null;
  signedArea: number;
};

const EPSILON = 1e-9;

function cross(a: PlotVertex, b: PlotVertex, c: PlotVertex) {
  return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
}
function onSegment(a: PlotVertex, b: PlotVertex, p: PlotVertex) {
  return Math.abs(cross(a,b,p)) <= EPSILON &&
    p.x >= Math.min(a.x,b.x)-EPSILON && p.x <= Math.max(a.x,b.x)+EPSILON &&
    p.y >= Math.min(a.y,b.y)-EPSILON && p.y <= Math.max(a.y,b.y)+EPSILON;
}
function segmentsIntersect(a: PlotVertex,b: PlotVertex,c: PlotVertex,d: PlotVertex) {
  const o1=cross(a,b,c), o2=cross(a,b,d), o3=cross(c,d,a), o4=cross(c,d,b);
  if (((o1>EPSILON&&o2< -EPSILON)||(o1< -EPSILON&&o2>EPSILON)) &&
      ((o3>EPSILON&&o4< -EPSILON)||(o3< -EPSILON&&o4>EPSILON))) return true;
  return (Math.abs(o1)<=EPSILON&&onSegment(a,b,c)) ||
    (Math.abs(o2)<=EPSILON&&onSegment(a,b,d)) ||
    (Math.abs(o3)<=EPSILON&&onSegment(c,d,a)) ||
    (Math.abs(o4)<=EPSILON&&onSegment(c,d,b));
}

/** Analyze a simple polygon from ordered local/grid coordinates. Units are supplied by the caller. */
export function analyzePolygon(vertices: PlotVertex[]): PolygonAnalysis {
  const errors: string[] = [];
  if (vertices.length < 3) errors.push("Add at least three vertices.");
  if (vertices.length > 5000) errors.push("A plot can contain at most 5,000 vertices.");
  if (vertices.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) errors.push("Every coordinate must be a finite number.");
  if (errors.length) return { valid:false, errors, area:0, perimeter:0, centroid:null, signedArea:0 };

  for (let i=0;i<vertices.length;i++) {
    for (let j=i+1;j<vertices.length;j++) {
      if (Math.hypot(vertices[i].x-vertices[j].x,vertices[i].y-vertices[j].y)<=EPSILON) {
        errors.push("Duplicate vertices are not allowed.");
        break;
      }
    }
    if (errors.length) break;
  }

  const n=vertices.length;
  for(let i=0;i<n;i++) {
    const a=vertices[i], b=vertices[(i+1)%n];
    for(let j=i+1;j<n;j++) {
      if(j===i || j===(i+1)%n || (j+1)%n===i) continue;
      if(i===0 && j===n-1) continue;
      if(segmentsIntersect(a,b,vertices[j],vertices[(j+1)%n])) {
        errors.push("Boundary edges cross or touch. Reorder the vertices to create a simple plot.");
        break;
      }
    }
    if(errors.length) break;
  }
  let twiceArea=0, cx=0, cy=0, perimeter=0;
  for(let i=0;i<n;i++) {
    const a=vertices[i], b=vertices[(i+1)%n];
    const term=a.x*b.y-b.x*a.y;
    twiceArea+=term; cx+=(a.x+b.x)*term; cy+=(a.y+b.y)*term;
    perimeter+=Math.hypot(b.x-a.x,b.y-a.y);
  }
  const signedArea=twiceArea/2, area=Math.abs(signedArea);
  if(area<=EPSILON) errors.push("The plot area is zero or the vertices are collinear.");
  const centroid=area>EPSILON ? {x:cx/(3*twiceArea),y:cy/(3*twiceArea)} : null;
  return {valid:errors.length===0,errors,area,perimeter,centroid,signedArea};
}

export function polygonToDxf(vertices: PlotVertex[], layer="PLOT_BOUNDARY") {
  if(vertices.length<3) throw new Error("A DXF plot boundary needs at least three vertices.");
  const safeLayer=layer.replace(/[^A-Za-z0-9_ -]/g,"").slice(0,64)||"PLOT_BOUNDARY";
  const lines=["0","SECTION","2","ENTITIES","0","LWPOLYLINE","8",safeLayer,"90",String(vertices.length),"70","1"];
  for(const point of vertices) lines.push("10",String(point.x),"20",String(point.y));
  lines.push("0","ENDSEC","0","EOF");
  return lines.join("\r\n");
}
