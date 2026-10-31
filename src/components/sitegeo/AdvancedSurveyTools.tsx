import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Leg = { id: number; bearing: number; distance: number };
type Station = { id: string; easting: number; northing: number; elevation: number; code: string };

const numberText = (n: number, digits = 3) => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === "\t" || ch === ";") && !quoted) { out.push(value.trim()); value = ""; }
    else value += ch;
  }
  out.push(value.trim()); return out;
}

export default function AdvancedSurveyTools({ T }: { T: (en: string, bn: string) => string }) {
  const [start, setStart] = useState({ easting: 500000, northing: 2600000 });
  const [legs, setLegs] = useState<Leg[]>([{ id: 1, bearing: 45, distance: 100 }, { id: 2, bearing: 135, distance: 100 }, { id: 3, bearing: 225, distance: 100 }, { id: 4, bearing: 315, distance: 100 }]);
  const [stations, setStations] = useState<Station[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ts, setTs] = useState({ azimuth: 45, slopeDistance: 50, verticalAngle: 5, instrumentRL: 10, prismHeight: 1.5 });
  const [earth, setEarth] = useState({ designRL: 10, cellArea: 25 });

  const traverse = useMemo(() => {
    let e = start.easting, n = start.northing, sumDep = 0, sumLat = 0, perimeter = 0;
    const rows = legs.map((leg) => {
      const az = ((leg.bearing % 360) + 360) % 360;
      const dep = leg.distance * Math.sin(az * Math.PI / 180);
      const lat = leg.distance * Math.cos(az * Math.PI / 180);
      e += dep; n += lat; sumDep += dep; sumLat += lat; perimeter += leg.distance;
      return { ...leg, dep, lat, easting: e, northing: n };
    });
    const closure = Math.hypot(sumDep, sumLat);
    return { rows, sumDep, sumLat, perimeter, closure, precision: closure > 0 ? perimeter / closure : Infinity };
  }, [start, legs]);

  const elevationStats = useMemo(() => {
    if (!stations.length) return null;
    const values = stations.map((s) => s.elevation);
    const min = Math.min(...values), max = Math.max(...values);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const cutDepths = values.map((v) => Math.max(0, v - earth.designRL));
    const fillDepths = values.map((v) => Math.max(0, earth.designRL - v));
    const cut = cutDepths.reduce((a, b) => a + b, 0) * earth.cellArea;
    const fill = fillDepths.reduce((a, b) => a + b, 0) * earth.cellArea;
    const range = max - min || 1;
    const bands = Array.from({ length: 5 }, (_, i) => {
      const low = min + range * i / 5, high = i === 4 ? max : min + range * (i + 1) / 5;
      return { low, high, count: values.filter((v) => v >= low && (i === 4 ? v <= high : v < high)).length };
    });
    return { min, max, average, cut, fill, net: fill - cut, bands };
  }, [stations, earth]);

  const updateLeg = (id: number, key: "bearing" | "distance", value: number) => setLegs((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  const importTotalStation = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(T("CSV must be 5 MB or smaller", "CSV ফাইল ৫ MB বা কম হতে হবে")); return; }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("CSV needs a header and at least one data row.");
      const header = parseCsvLine(lines[0]).map((v) => v.toLowerCase().replace(/[ _-]/g, ""));
      const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
      const idIndex = find("point", "pointid", "name", "id", "station");
      const eIndex = find("easting", "east", "x");
      const nIndex = find("northing", "north", "y");
      const zIndex = find("elevation", "elev", "rl", "z", "height");
      const codeIndex = find("code", "feature", "description");
      if (eIndex < 0 || nIndex < 0 || zIndex < 0) throw new Error("Required headers: Easting, Northing, Elevation. Optional: Point, Code.");
      const parsed = lines.slice(1).map((line, i) => {
        const cells = parseCsvLine(line);
        const easting = Number(cells[eIndex]), northing = Number(cells[nIndex]), elevation = Number(cells[zIndex]);
        if (![easting, northing, elevation].every(Number.isFinite)) throw new Error("Invalid numeric value at data row " + (i + 2));
        return { id: idIndex >= 0 && cells[idIndex] ? cells[idIndex] : "P" + (i + 1), easting, northing, elevation, code: codeIndex >= 0 ? cells[codeIndex] || "" : "" };
      });
      if (!parsed.length || parsed.length > 10000) throw new Error("Import between 1 and 10,000 survey rows.");
      setStations(parsed);
      toast.success(T(parsed.length + " total station points imported", parsed.length + "টি টোটাল স্টেশন পয়েন্ট ইমপোর্ট হয়েছে"));
    } catch (error) { toast.error(error instanceof Error ? error.message : T("Could not read CSV", "CSV পড়া যায়নি")); }
  };
  const exportTraverse = () => {
    const rows = [["Leg", "Bearing_deg", "Distance_m", "Departure_m", "Latitude_m", "Easting_m", "Northing_m"], ...traverse.rows.map((r, i) => [i + 1, r.bearing, r.distance, r.dep, r.lat, r.easting, r.northing])];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "civilos-traverse.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const exportStations = () => {
    const rows = [["Point", "Easting", "Northing", "Elevation", "Code"], ...stations.map((s) => [s.id, s.easting, s.northing, s.elevation, s.code])];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "civilos-total-station.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const horizontalDistance = ts.slopeDistance * Math.cos(ts.verticalAngle * Math.PI / 180);
  const verticalDifference = ts.slopeDistance * Math.sin(ts.verticalAngle * Math.PI / 180);
  const pointRL = ts.instrumentRL + verticalDifference - ts.prismHeight;

  return <Card className="p-4 space-y-3">
    <div><p className="font-semibold text-sm">{T("Advanced land surveying", "অ্যাডভান্সড ল্যান্ড সার্ভেয়িং")}</p><p className="text-xs text-muted-foreground">{T("Traverse computation, theodolite observations, total-station CSV and elevation/earthwork analysis.", "ট্রাভার্স হিসাব, থিওডোলাইট পর্যবেক্ষণ, টোটাল স্টেশন CSV এবং উচ্চতা ও আর্থওয়ার্ক বিশ্লেষণ।")}</p></div>
    <Tabs defaultValue="traverse">
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="traverse" className="text-xs">{T("Traverse", "ট্রাভার্স")}</TabsTrigger>
        <TabsTrigger value="theodolite" className="text-xs">{T("Theodolite", "থিওডোলাইট")}</TabsTrigger>
        <TabsTrigger value="total" className="text-xs">{T("Total station", "টোটাল স্টেশন")}</TabsTrigger>
        <TabsTrigger value="earth" className="text-xs">{T("Elevation", "উচ্চতা")}</TabsTrigger>
      </TabsList>
      <TabsContent value="traverse" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Enter whole-circle bearings clockwise from north and horizontal distances in metres. Include the closing leg to check traverse closure.", "উত্তর দিক থেকে ঘড়ির কাঁটার দিকে Whole Circle Bearing এবং মিটারে অনুভূমিক দূরত্ব দিন। ক্লোজার যাচাই করতে শেষ বন্ধ লেগও যোগ করুন।")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">{T("Start Easting (m)", "শুরুর ইস্টিং (মি)")}</Label><Input type="number" value={start.easting} onChange={(e) => setStart({ ...start, easting: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">{T("Start Northing (m)", "শুরুর নর্থিং (মি)")}</Label><Input type="number" value={start.northing} onChange={(e) => setStart({ ...start, northing: Number(e.target.value) })} /></div>
        </div>
        <div className="space-y-2">{legs.map((leg, index) => <div key={leg.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div><Label className="text-xs">{T("Leg", "লেগ")} {index + 1} · {T("Bearing °", "বেয়ারিং °")}</Label><Input type="number" min="0" max="360" value={leg.bearing} onChange={(e) => updateLeg(leg.id, "bearing", Number(e.target.value))} /></div>
          <div><Label className="text-xs">{T("Distance (m)", "দূরত্ব (মি)")}</Label><Input type="number" min="0" value={leg.distance} onChange={(e) => updateLeg(leg.id, "distance", Number(e.target.value))} /></div>
          <Button size="sm" variant="outline" disabled={legs.length <= 1} onClick={() => setLegs((items) => items.filter((item) => item.id !== leg.id))}>{T("Remove", "বাদ")}</Button>
        </div>)}</div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setLegs((items) => [...items, { id: Math.max(0, ...items.map((x) => x.id)) + 1, bearing: 0, distance: 0 }])}>{T("Add traverse leg", "নতুন লেগ")}</Button><Button size="sm" onClick={exportTraverse}>{T("Export traverse CSV", "ট্রাভার্স CSV এক্সপোর্ট")}</Button></div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted p-2">{T("Perimeter", "মোট দৈর্ঘ্য")}: <b>{numberText(traverse.perimeter)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Linear misclosure", "ক্লোজার ত্রুটি")}: <b>{numberText(traverse.closure)} m</b></div>
          <div className="rounded-md bg-muted p-2">Σ Departure: <b>{numberText(traverse.sumDep)} m</b></div>
          <div className="rounded-md bg-muted p-2">Σ Latitude: <b>{numberText(traverse.sumLat)} m</b></div>
        </div>
        <p className="text-xs">{T("Relative precision", "আপেক্ষিক নির্ভুলতা")}: <b>{Number.isFinite(traverse.precision) ? "1 : " + Math.round(traverse.precision).toLocaleString() : "—"}</b></p>
        <div className="max-h-40 overflow-auto text-xs"><table className="w-full"><thead><tr className="text-left border-b"><th className="py-1">#</th><th>Easting</th><th>Northing</th></tr></thead><tbody>{traverse.rows.map((r, i) => <tr key={r.id} className="border-b"><td className="py-1">{i + 1}</td><td>{numberText(r.easting)}</td><td>{numberText(r.northing)}</td></tr>)}</tbody></table></div>
      </TabsContent>
      <TabsContent value="theodolite" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Single-shot reduction using slope distance and vertical angle measured from the horizontal. Positive angle is an elevation angle.", "অনুভূমিক থেকে মাপা স্লোপ দূরত্ব ও উল্লম্ব কোণ দিয়ে একক শটের হিসাব। ধনাত্মক কোণ উপরের দিকে।")}</p>
        <div className="grid grid-cols-2 gap-2">
          {([["azimuth","Horizontal circle / azimuth (°)"],["slopeDistance","Slope distance (m)"],["verticalAngle","Vertical angle (°)"],["instrumentRL","Instrument RL (m)"],["prismHeight","Prism height (m)"]] as const).map(([key,label]) => <div key={key}><Label className="text-xs">{T(label, label)}</Label><Input type="number" value={ts[key]} onChange={(e) => setTs({ ...ts, [key]: Number(e.target.value) })} /></div>)}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted p-2">{T("Horizontal distance", "অনুভূমিক দূরত্ব")}: <b>{numberText(horizontalDistance)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Vertical difference", "উল্লম্ব পার্থক্য")}: <b>{numberText(verticalDifference)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Reduced level", "রিডিউসড লেভেল")}: <b>{numberText(pointRL)} m</b></div>
          <div className="rounded-md bg-muted p-2">{T("Azimuth", "আজিমুথ")}: <b>{numberText(((ts.azimuth % 360) + 360) % 360, 2)}°</b></div>
        </div>
        <p className="text-[11px] text-muted-foreground">{T("Assumes a vertical angle from the horizontal and a correctly entered prism height. Apply instrument-specific corrections and verify field observations.", "অনুভূমিক থেকে উল্লম্ব কোণ এবং সঠিক প্রিজম উচ্চতা ধরে হিসাব করা হয়েছে। যন্ত্রভিত্তিক সংশোধন প্রয়োগ করে মাঠের রিডিং যাচাই করুন।")}</p>
      </TabsContent>
      <TabsContent value="total" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Import a CSV with Easting, Northing and Elevation columns. Optional columns: Point and Code. Coordinates must use one projected coordinate system and metre units.", "Easting, Northing এবং Elevation কলামসহ CSV ইমপোর্ট করুন। ঐচ্ছিক: Point ও Code। সব স্থানাঙ্ক একই projected coordinate system এবং মিটার এককে হতে হবে।")}</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.txt,text/plain" className="hidden" onChange={importTotalStation} />
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => fileRef.current?.click()}>{T("Import total station CSV", "টোটাল স্টেশন CSV ইমপোর্ট")}</Button><Button size="sm" variant="outline" disabled={!stations.length} onClick={exportStations}>{T("Export CSV", "CSV এক্সপোর্ট")}</Button><Button size="sm" variant="outline" disabled={!stations.length} onClick={() => setStations([])}>{T("Clear data", "ডেটা মুছুন")}</Button></div>
        <p className="text-xs text-muted-foreground">{T("Rows loaded", "লোড করা রো")}: <b>{stations.length}</b></p>
        <div className="max-h-56 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-background"><tr className="border-b text-left"><th className="py-1">Point</th><th>Easting</th><th>Northing</th><th>RL</th><th>Code</th></tr></thead><tbody>{stations.slice(0, 500).map((s, i) => <tr key={s.id + i} className="border-b"><td className="py-1">{s.id}</td><td>{numberText(s.easting)}</td><td>{numberText(s.northing)}</td><td>{numberText(s.elevation)}</td><td>{s.code}</td></tr>)}</tbody></table></div>
        {stations.length > 500 && <p className="text-[11px] text-muted-foreground">{T("Showing first 500 rows in the preview; all rows remain available for calculations and export.", "প্রিভিউতে প্রথম ৫০০টি রো দেখানো হচ্ছে; হিসাব ও এক্সপোর্টে সব রো থাকবে।")}</p>}
      </TabsContent>
      <TabsContent value="earth" className="space-y-3">
        <p className="text-xs text-muted-foreground">{T("Uses imported total-station elevations as representative cells. Enter the design level and ground area represented by each point.", "ইমপোর্ট করা টোটাল স্টেশন উচ্চতাকে প্রতিনিধি সেল হিসেবে ব্যবহার করে। ডিজাইন লেভেল ও প্রতিটি পয়েন্টের প্রতিনিধিত্ব করা ভূমির ক্ষেত্রফল দিন।")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">{T("Design RL (m)", "ডিজাইন RL (মি)")}</Label><Input type="number" value={earth.designRL} onChange={(e) => setEarth({ ...earth, designRL: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">{T("Cell area per point (m²)", "প্রতি পয়েন্ট সেলের ক্ষেত্রফল (মি²)")}</Label><Input type="number" min="0" value={earth.cellArea} onChange={(e) => setEarth({ ...earth, cellArea: Math.max(0, Number(e.target.value)) })} /></div>
        </div>
        {!elevationStats ? <p className="text-xs text-muted-foreground">{T("Import total-station CSV data first.", "প্রথমে টোটাল স্টেশন CSV ডেটা ইমপোর্ট করুন।")}</p> : <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted p-2">Min / Max RL: <b>{numberText(elevationStats.min)} / {numberText(elevationStats.max)} m</b></div>
            <div className="rounded-md bg-muted p-2">Mean RL: <b>{numberText(elevationStats.average)} m</b></div>
            <div className="rounded-md bg-muted p-2">{T("Estimated cut", "আনুমানিক কাট")}: <b>{numberText(elevationStats.cut)} m³</b></div>
            <div className="rounded-md bg-muted p-2">{T("Estimated fill", "আনুমানিক ফিল")}: <b>{numberText(elevationStats.fill)} m³</b></div>
          </div>
          <p className="text-xs">{T("Net fill (+) / cut (−)", "নেট ফিল (+) / কাট (−)")}: <b>{numberText(elevationStats.net)} m³</b></p>
          <div className="space-y-1"><p className="text-xs font-medium">{T("Elevation bands (not interpolated contour lines)", "উচ্চতা ব্যান্ড (ইন্টারপোলেটেড কনট্যুর লাইন নয়)")}</p>{elevationStats.bands.map((band, i) => <div key={i} className="flex justify-between rounded bg-muted/60 px-2 py-1 text-xs"><span>{numberText(band.low, 2)} – {numberText(band.high, 2)} m</span><b>{band.count} {T("points", "পয়েন্ট")}</b></div>)}</div>
        </>}
        <p className="text-[11px] text-muted-foreground">{T("Preliminary estimate only: the cell-area method is not a TIN/grid surface model and does not interpolate contours. For design, payment or construction, use a validated terrain model and a qualified surveyor/engineer.", "এটি প্রাথমিক হিসাব: cell-area পদ্ধতি TIN/grid surface model নয় এবং কনট্যুর ইন্টারপোলেট করে না। ডিজাইন, বিল বা নির্মাণের জন্য যাচাইকৃত terrain model ও যোগ্য সার্ভেয়ার/ইঞ্জিনিয়ার ব্যবহার করুন।")}</p>
      </TabsContent>
    </Tabs>
  </Card>;
}
