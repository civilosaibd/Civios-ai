import { useCloudState } from "@/lib/cloudState";
import { useActiveProjectId } from "@/lib/projectSelection";
import { listProjectArtifacts } from "@/lib/projectArtifacts";
import { useProjectArtifactAutosave } from "@/hooks/useProjectArtifactAutosave";
import AdvancedSurveyTools from "@/components/sitegeo/AdvancedSurveyTools";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map as MapIcon, Ruler, Hexagon, Home, Undo2, Redo2, Trash2, LocateFixed, Download, Search, Upload, Maximize2, Minimize2, Crosshair, Layers } from "lucide-react";
import SEO from "@/components/SEO";
import ThemeToggle from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { useUnits } from "@/lib/UnitsContext";
import UnitsSwitch from "@/components/UnitsSwitch";
import LengthInput from "@/components/LengthInput";
import { fmtLengthFt, sftToDisplay } from "@/lib/units";
import { toast } from "sonner";
import { DEFAULT_INPUT, generatePlan, type PlanInput } from "@/lib/planGenerator";
import { bearing, distance, landUnits, offset, pathLength, polygonArea, quadArea, SFT_PER_M2, type LatLng } from "@/lib/survey";

type Mode = "distance" | "area";
type SurveyTool = "point" | "line" | "polygon";
const FT = 0.3048;
const DHAKA: LatLng = { lat: 23.8103, lng: 90.4125 };

export default function SiteGeoPage() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const T = (en: string, b: string) => (bn ? b : en);
  const { system } = useUnits();
  const projectId = useActiveProjectId();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapShell = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawLayer = useRef<L.LayerGroup | null>(null);
  const planLayer = useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = useState<Mode>("area");
  const [pts, setPts] = useCloudState<LatLng[]>("civilos.sitePts", []);
  const [basemap, setBasemap] = useState<"street" | "satellite" | "terrain" | "hybrid">("street");
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [pointerCoords, setPointerCoords] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng>(DHAKA);
  const [mapZoom, setMapZoom] = useState(17);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const gpsLayer = useRef<L.LayerGroup | null>(null);
  const gpsCentered = useRef(false);
  const [query, setQuery] = useState("");
  const tiles = useRef<{ street: L.TileLayer; sat: L.TileLayer; terrain: L.TileLayer; labels: L.TileLayer } | null>(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  const [surveyTool, setSurveyTool] = useState<SurveyTool>("polygon");
  const ptsRef = useRef(pts); ptsRef.current = pts;
  const undoStack = useRef<LatLng[][]>([]);
  const redoStack = useRef<LatLng[][]>([]);
  const updateSurveyPoints = (next: LatLng[]) => { undoStack.current.push(ptsRef.current); if (undoStack.current.length > 100) undoStack.current.shift(); redoStack.current = []; ptsRef.current = next; setPts(next); };
  const undoSurvey = () => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(ptsRef.current); ptsRef.current = previous; setPts(previous); };
  const redoSurvey = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(ptsRef.current); ptsRef.current = next; setPts(next); };

  const [inp] = useCloudState<PlanInput>("civilos.plan", DEFAULT_INPUT, { merge: true });
  const [projectArtifactId, setProjectArtifactId] = useState<string | undefined>();
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadedProjectId(null);
    setProjectArtifactId(undefined);
    setProjectLoadError(null);
    if (!projectId) return;
    void listProjectArtifacts(projectId).then((items) => {
      if (cancelled) return;
      const saved = items.find((item) => item.artifact_type === "site-geo-survey");
      const data = saved?.data ?? {};
      const savedPoints = Array.isArray(data.points) ? data.points as LatLng[] : [];
      if (savedPoints.every((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng) && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180)) {
        ptsRef.current = savedPoints; setPts(savedPoints);
      } else { ptsRef.current = []; setPts([]); }
      if (data.mode === "area" || data.mode === "distance") setMode(data.mode);
      if (data.surveyTool === "point" || data.surveyTool === "line" || data.surveyTool === "polygon") setSurveyTool(data.surveyTool);
      setProjectArtifactId(saved?.id);
      setLoadedProjectId(projectId);
    }).catch((error) => {
      if (!cancelled) { setProjectLoadError(error instanceof Error ? error.message : "Could not load this project survey."); setLoadedProjectId(projectId); }
    });
    return () => { cancelled = true; };
  }, [projectId, setPts]);

  const projectSave = useProjectArtifactAutosave({
    projectId: projectId ?? "", artifactId: projectArtifactId, artifactType: "site-geo-survey",
    title: "Site GEO & Survey", description: "Project-scoped WGS84 map survey points and measurement mode",
    data: { points: pts, mode, surveyTool }, enabled: !!projectId && loadedProjectId === projectId && !projectLoadError,
    debounceMs: 1500,
  });
  useEffect(() => { if (projectSave.artifactId && projectSave.artifactId !== projectArtifactId) setProjectArtifactId(projectSave.artifactId); }, [projectSave.artifactId, projectArtifactId]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = L.map(mapEl.current, { zoomControl: true }).setView([DHAKA.lat, DHAKA.lng], 17);
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, maxNativeZoom: 19, attribution: "© OpenStreetMap contributors" });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, maxNativeZoom: 19, attribution: "Tiles © Esri" });
    const terrain = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 20, maxNativeZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA)" });
    const labels = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: "© CARTO" });
    street.addTo(m);
    tiles.current = { street, sat, terrain, labels };
    drawLayer.current = L.layerGroup().addTo(m);
    planLayer.current = L.layerGroup().addTo(m);
    gpsLayer.current = L.layerGroup().addTo(m);
    L.control.scale({ imperial: true, metric: true, position: "bottomleft" }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => { const point = { lat: e.latlng.lat, lng: e.latlng.lng }; updateSurveyPoints([...ptsRef.current, point]); });
    m.on("mousemove", (e: L.LeafletMouseEvent) => setPointerCoords({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.on("moveend", () => {
      const center = m.getCenter();
      setMapCenter({ lat: center.lat, lng: center.lng });
      setMapZoom(m.getZoom());
    });
    map.current = m;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); map.current = null; };
  }, []);

  const centered = useRef(false);
  useEffect(() => {
    if (centered.current || !map.current || pts.length === 0) return;
    centered.current = true;
    map.current.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 19 });
  }, [pts]);

  useEffect(() => {
    const m = map.current, t = tiles.current;
    if (!m || !t) return;
    [t.street, t.sat, t.terrain, t.labels].forEach((layer) => { if (m.hasLayer(layer)) m.removeLayer(layer); });
    if (basemap === "street") t.street.addTo(m);
    if (basemap === "satellite") t.sat.addTo(m);
    if (basemap === "terrain") t.terrain.addTo(m);
    if (basemap === "hybrid") { t.sat.addTo(m); t.labels.addTo(m); }
  }, [basemap]);

  useEffect(() => {
    const g = gpsLayer.current;
    if (!g) return;
    g.clearLayers();
    if (gpsPosition) {
      L.circle([gpsPosition.lat, gpsPosition.lng], { radius: gpsPosition.accuracy, color: "#0ea5e9", weight: 1, fillOpacity: 0.08 }).addTo(g);
      L.circleMarker([gpsPosition.lat, gpsPosition.lng], { radius: 7, color: "#0284c7", weight: 3, fillColor: "#38bdf8", fillOpacity: 1 })
        .bindTooltip(T("Your GPS position", "আপনার GPS অবস্থান")).addTo(g);
    }
  }, [gpsPosition, bn]);

  useEffect(() => {
    if (!gpsTracking) return;
    if (!navigator.geolocation) {
      toast.error(T("GPS is not available in this browser", "এই ব্রাউজারে GPS সুবিধা নেই"));
      setGpsTracking(false);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
        setGpsPosition(next);
        if (!gpsCentered.current) { map.current?.setView([next.lat, next.lng], 18); gpsCentered.current = true; }
      },
      () => {
        toast.error(T("Unable to access GPS. Check location permission.", "GPS ব্যবহার করা যাচ্ছে না। লোকেশন অনুমতি পরীক্ষা করুন।"));
        setGpsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsTracking]);

  useEffect(() => {
    const g = drawLayer.current; if (!g) return;
    g.clearLayers();
    const ll = pts.map((p) => [p.lat, p.lng] as [number, number]);
    pts.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 5, color: "#f97316", fillOpacity: 1 }).addTo(g));
    if (surveyTool === "polygon" && pts.length >= 3) L.polygon(ll, { color: "#2563eb", fillOpacity: 0.2 }).addTo(g);
    else if (surveyTool === "line" && pts.length >= 2) L.polyline(ll, { color: "#2563eb", weight: 3 }).addTo(g);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
        icon: L.divIcon({ className: "", html: `<span style="background:#fff;color:#0f172a;padding:1px 4px;border-radius:4px;font-size:11px;white-space:nowrap;box-shadow:0 1px 3px #0003">${fmtLengthFt(distance(a, b) / FT, system, 1)}</span>` }),
        interactive: false,
      }).addTo(g);
    }
  }, [pts, mode, system, surveyTool]);

  const placePlan = () => {
    const m = map.current, g = planLayer.current; if (!m || !g) return;
    g.clearLayers();
    const c = m.getCenter(); const center = { lat: c.lat, lng: c.lng };
    const plan = generatePlan(inp);
    // Rotation so road side faces the chosen direction (road at "front" = local -y)
    const rot = { south: 0, north: 180, east: 90, west: -90 }[inp.road] * (Math.PI / 180);
    const toLL = (x: number, y: number) => {
      const ex = x * Math.cos(rot) - y * Math.sin(rot), ny = x * Math.sin(rot) + y * Math.cos(rot);
      const p = offset(center, ex * FT, ny * FT); return [p.lat, p.lng] as [number, number];
    };
    const W = inp.plotWidth, D = inp.plotDepth;
    const rect = (x0: number, y0: number, x1: number, y1: number) => [toLL(x0, y0), toLL(x1, y0), toLL(x1, y1), toLL(x0, y1)];
    L.polygon(rect(-W / 2, -D / 2, W / 2, D / 2), { color: "#16a34a", dashArray: "6 4", fillOpacity: 0.08 }).bindTooltip(T("Plot", "প্লট")).addTo(g);
    const bx0 = -W / 2 + plan.setbacks.side, by0 = -D / 2 + plan.setbacks.front;
    plan.rooms.forEach((r) => {
      L.polygon(rect(bx0 + r.x, by0 + r.y, bx0 + r.x + r.w, by0 + r.y + r.h), { color: "#0f172a", weight: 1, fillColor: "#2563eb", fillOpacity: 0.25 })
        .bindTooltip(bn ? r.nameBn : r.name).addTo(g);
    });
    L.polygon(rect(-W / 2 - 5, -D / 2 - 14, W / 2 + 5, -D / 2 - 2), { color: "#334155", fillColor: "#334155", fillOpacity: 0.5, weight: 0 }).bindTooltip(T("Road", "রাস্তা")).addTo(g);
    m.fitBounds(L.latLngBounds(rect(-W / 2, -D / 2 - 14, W / 2, D / 2)), { padding: [40, 40] });
    toast.success(T("Plan placed at map centre", "ম্যাপের মাঝখানে প্ল্যান বসানো হয়েছে"));
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error(T("Location not available", "লোকেশন পাওয়া যায়নি"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setGpsPosition(next);
        map.current?.setView([next.lat, next.lng], 19);
        gpsCentered.current = true;
      },
      () => toast.error(T("Location permission denied", "লোকেশনের অনুমতি দেওয়া হয়নি")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  };

  const toggleMapFullscreen = async () => {
    const target = mapShell.current;
    if (!target) return;
    try {
      if (!document.fullscreenElement) await target.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      toast.error(T("Fullscreen is not available", "ফুলস্ক্রিন চালু করা যাচ্ছে না"));
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setMapFullscreen(document.fullscreenElement === mapShell.current);
      window.setTimeout(() => map.current?.invalidateSize(), 150);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  const search = async () => {
    if (!query.trim()) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bd&q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (!d[0]) return toast.error(T("Place not found", "জায়গা পাওয়া যায়নি"));
      map.current?.setView([+d[0].lat, +d[0].lon], 17);
    } catch { toast.error(T("Search failed", "খোঁজা যায়নি")); }
  };

  const exportGeoJSON = () => {
    if (pts.length < (surveyTool === "point" ? 1 : surveyTool === "polygon" ? 3 : 2)) return toast.error(T("Add enough points for this survey type", "এই সার্ভে টাইপের জন্য পর্যাপ্ত পয়েন্ট যোগ করুন"));
    const coords = pts.map((p) => [p.lng, p.lat]);
    const geometry = surveyTool === "point" ? { type: "MultiPoint", coordinates: coords } : surveyTool === "polygon" ? { type: "Polygon", coordinates: [[...coords, coords[0]]] } : { type: "LineString", coordinates: coords };
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "CivilOS survey" }, geometry }] }, null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "civilos-survey.geojson"; a.click();
  };

  const importGeoJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again after a failed or successful import.
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(T("GeoJSON file must be 10 MB or smaller", "GeoJSON ফাইল ১০ MB বা তার কম হতে হবে"));
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const root = parsed as {
        type?: string;
        features?: Array<{ geometry?: { type?: string; coordinates?: unknown } | null }>;
        geometry?: { type?: string; coordinates?: unknown } | null;
        coordinates?: unknown;
      };
      let geometry: { type?: string; coordinates?: unknown } | null | undefined;
      if (root?.type === "FeatureCollection") {
        if (!Array.isArray(root.features) || root.features.length !== 1) {
          throw new Error(T("Import one feature at a time. Export or select a GeoJSON with a single feature.", "একবারে একটি ফিচার ইমপোর্ট করুন। একটি ফিচারসহ GeoJSON নির্বাচন করুন।"));
        }
        geometry = root.features[0]?.geometry;
      } else if (root?.type === "Feature") {
        geometry = root.geometry;
      } else {
        geometry = root as { type?: string; coordinates?: unknown };
      }
      if (!geometry || !Array.isArray(geometry.coordinates)) {
        throw new Error(T("No supported geometry was found in this GeoJSON file.", "এই GeoJSON ফাইলে সমর্থিত জ্যামিতি পাওয়া যায়নি।"));
      }
      const raw = geometry.coordinates as unknown[];
      let coordinatePairs: unknown[];
      if (geometry.type === "Point") coordinatePairs = [raw];
      else if (geometry.type === "MultiPoint" || geometry.type === "LineString") coordinatePairs = raw;
      else if (geometry.type === "Polygon") coordinatePairs = Array.isArray(raw[0]) ? raw[0] as unknown[] : [];
      else throw new Error(T("Supported geometry: Point, MultiPoint, LineString, or Polygon.", "সমর্থিত জ্যামিতি: Point, MultiPoint, LineString অথবা Polygon।"));

      const imported = coordinatePairs.map((pair): LatLng => {
        if (!Array.isArray(pair) || pair.length < 2 || typeof pair[0] !== "number" || typeof pair[1] !== "number") {
          throw new Error(T("The file contains invalid coordinates.", "ফাইলে ভুল স্থানাঙ্ক রয়েছে।"));
        }
        const [lng, lat] = pair as [number, number];
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          throw new Error(T("Coordinates are outside valid latitude/longitude ranges.", "স্থানাঙ্ক বৈধ অক্ষাংশ/দ্রাঘিমাংশ সীমার বাইরে।"));
        }
        return { lat, lng };
      });
      if (imported.length > 1) {
        const first = imported[0], last = imported[imported.length - 1];
        if (first.lat === last.lat && first.lng === last.lng) imported.pop();
      }
      if (imported.length < 1 || imported.length > 5000) {
        throw new Error(T("Import must contain between 1 and 5,000 vertices.", "ইমপোর্টে ১ থেকে ৫,০০০টি শীর্ষবিন্দু থাকতে হবে।"));
      }
      if (geometry.type === "Polygon" && imported.length < 3) {
        throw new Error(T("A polygon needs at least 3 distinct vertices.", "একটি বহুভুজে অন্তত ৩টি শীর্ষবিন্দু দরকার।"));
      }
      centered.current = false;
      updateSurveyPoints(imported);
      const m = map.current;
      if (m && imported.length > 1) {
        m.fitBounds(L.latLngBounds(imported.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 19 });
      } else if (m && imported.length === 1) {
        m.setView([imported[0].lat, imported[0].lng], 18);
      }
      if (geometry.type === "Polygon") { setMode("area"); setSurveyTool("polygon"); }
      else if (geometry.type === "LineString") { setMode("distance"); setSurveyTool("line"); }
      else if (geometry.type === "MultiPoint" || geometry.type === "Point") { setSurveyTool("point"); setMode("distance"); }
      toast.success(T(`Imported ${imported.length} coordinate point(s)`, `${imported.length}টি স্থানাঙ্ক বিন্দু ইমপোর্ট হয়েছে`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : T("Could not read this GeoJSON file.", "GeoJSON ফাইলটি পড়া যায়নি।"));
    }
  };

  const areaSft = polygonArea(pts) * SFT_PER_M2;
  const u = landUnits(areaSft);
  const len = pathLength(pts, mode === "area");
  const fmt = (n: number, d = 2) => n.toLocaleString(bn ? "bn-BD" : "en-US", { maximumFractionDigits: d });

  return (
    <SidebarProvider>
      <SEO title="Site Geo & Survey — CivilOS AI" description="Measure land on the map in decimal, katha and bigha, place your house plan on the plot, and use survey calculators." />
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur z-[1000]">
            <div className="flex items-center gap-2"><SidebarTrigger />
              <h1 className="font-heading font-semibold flex items-center gap-2"><MapIcon className="h-4 w-4 text-accent" /> {T("Site Geo & Survey", "সাইট ম্যাপ ও সার্ভে")}</h1>
            </div>
            <div className="flex items-center gap-2"><span className="hidden sm:inline text-xs text-muted-foreground">{projectId ? (projectSave.status === "saving" ? T("Saving…", "সেভ হচ্ছে…") : projectSave.status === "saved" ? T("Saved to project", "প্রজেক্টে সেভ হয়েছে") : projectSave.status === "error" ? T("Save failed", "সেভ হয়নি") : T("Project linked", "প্রজেক্ট সংযুক্ত")) : T("Personal workspace", "ব্যক্তিগত ওয়ার্কস্পেস")}</span><UnitsSwitch /><ThemeToggle /></div>
          </header>
          <main className="p-4 md:p-6 space-y-4">
            {projectLoadError && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{T("Could not load this project survey: ", "প্রজেক্টের সার্ভে লোড করা যায়নি: ")}{projectLoadError}</div>}
            {projectSave.error && <div className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">{projectSave.error}</div>}
            <section className="rounded-xl border bg-card p-4 md:p-5 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary"><span className="h-2 w-2 rounded-full bg-emerald-500" />{T("GIS WORKSPACE", "জিআইএস ওয়ার্কস্পেস")}</div>
                  <h2 className="text-xl md:text-2xl font-semibold tracking-tight">{T("Site mapping & land survey", "সাইট ম্যাপিং ও ভূমি জরিপ")}</h2>
                  <p className="text-sm text-muted-foreground">{T("Map your site, capture boundary points and review measurements in one workspace.", "একটি ওয়ার্কস্পেস থেকেই সাইট ম্যাপ করুন, সীমানার পয়েন্ট নিন এবং পরিমাপ দেখুন।")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{T("Project workspace", "প্রজেক্ট ওয়ার্কস্পেস")}</span>
                  <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{T("WGS84 · Lat/Lng", "WGS84 · অক্ষাংশ/দ্রাঘিমাংশ")}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{T("Survey points", "সার্ভে পয়েন্ট")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{fmt(pts.length, 0)}</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{T("Land area", "জমির ক্ষেত্রফল")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{pts.length >= 3 ? fmt(u.decimal, 2) : "—"} <span className="text-xs font-normal text-muted-foreground">{T("decimal", "শতাংশ")}</span></p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{T("Boundary length", "সীমানার দৈর্ঘ্য")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{pts.length >= 2 ? fmt(system === "metric" ? len : len / FT, 2) : "—"} <span className="text-xs font-normal text-muted-foreground">{system === "metric" ? "m" : "ft"}</span></p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{T("Active tool", "সক্রিয় টুল")}</p><p className="mt-1 text-xl font-semibold">{mode === "area" ? T("Area", "ক্ষেত্রফল") : T("Distance", "দূরত্ব")}</p></div>
              </div>
            </section>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap gap-2">
                <div className="flex gap-1 flex-1 min-w-[200px]">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder={T("Search place, e.g. Mirpur 10", "জায়গা খুঁজুন, যেমন মিরপুর ১০")} />
                  <Button size="icon" variant="outline" onClick={search} aria-label="Search"><Search className="h-4 w-4" /></Button>
                </div>
                <Button size="sm" variant="outline" onClick={locate}><LocateFixed className="h-4 w-4 mr-1" />{T("My location", "আমার লোকেশন")}</Button>
                <Button size="sm" variant={gpsTracking ? "default" : "outline"} onClick={() => setGpsTracking((v) => !v)}><Crosshair className="h-4 w-4 mr-1" />{gpsTracking ? T("Stop GPS", "GPS বন্ধ") : T("Track GPS", "GPS ট্র্যাক")}</Button>
                <div className="flex items-center gap-2 rounded-md border bg-background px-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <select aria-label={T("Map layer", "ম্যাপ লেয়ার")} className="h-9 bg-transparent text-sm outline-none" value={basemap} onChange={(e) => setBasemap(e.target.value as typeof basemap)}>
                    <option value="street">{T("Street", "স্ট্রিট")}</option>
                    <option value="satellite">{T("Satellite", "স্যাটেলাইট")}</option>
                    <option value="terrain">{T("Terrain", "ভূপ্রকৃতি")}</option>
                    <option value="hybrid">{T("Hybrid", "হাইব্রিড")}</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={surveyTool === "point" ? "default" : "outline"} onClick={() => { setSurveyTool("point"); setMode("distance"); }}><Crosshair className="h-4 w-4 mr-1" />{T("Point survey", "পয়েন্ট সার্ভে")}</Button>
                <Button size="sm" variant={surveyTool === "line" ? "default" : "outline"} onClick={() => { setSurveyTool("line"); setMode("distance"); }}><Ruler className="h-4 w-4 mr-1" />{T("Line survey", "লাইন সার্ভে")}</Button>
                <Button size="sm" variant={surveyTool === "polygon" ? "default" : "outline"} onClick={() => { setSurveyTool("polygon"); setMode("area"); }}><Hexagon className="h-4 w-4 mr-1" />{T("Polygon survey", "পলিগন সার্ভে")}</Button>
                <Button size="sm" variant="outline" onClick={() => setMode("area")}>{T("Measure area", "জমির মাপ")}</Button>
                <Button size="sm" variant="outline" onClick={() => setMode("distance")}>{T("Measure distance", "দূরত্ব মাপ")}</Button>
                <Button size="sm" variant="outline" disabled={!undoStack.current.length} onClick={undoSurvey}><Undo2 className="h-4 w-4 mr-1" />{T("Undo", "পিছনে")}</Button>
                <Button size="sm" variant="outline" disabled={!redoStack.current.length} onClick={redoSurvey}><Redo2 className="h-4 w-4 mr-1" />{T("Redo", "আবার")}</Button>
                <Button size="sm" variant="outline" onClick={() => updateSurveyPoints([])}><Trash2 className="h-4 w-4 mr-1" />{T("Clear", "মুছুন")}</Button>
                <Button size="sm" variant="secondary" onClick={placePlan}><Home className="h-4 w-4 mr-1" />{T("Show my plan on map", "আমার প্ল্যান ম্যাপে দেখান")}</Button>
                <input ref={importFileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={importGeoJSON} />
                <Button size="sm" variant="outline" onClick={() => importFileRef.current?.click()}><Upload className="h-4 w-4 mr-1" />{T("Import GeoJSON", "GeoJSON ইমপোর্ট")}</Button>
                <Button size="sm" variant="outline" onClick={exportGeoJSON}><Download className="h-4 w-4 mr-1" />GeoJSON</Button>
              </div>
              <Card ref={mapShell} className={`overflow-hidden border shadow-sm ${mapFullscreen ? "fixed inset-0 z-[2000] rounded-none bg-background" : ""}`}>
                <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                  <div className="min-w-0"><p className="text-sm font-medium">{T("Interactive site map", "ইন্টার‌্যাক্টিভ সাইট ম্যাপ")}</p><p className="text-xs text-muted-foreground">{T("Select a tool, then click the map to add survey points.", "টুল নির্বাচন করে ম্যাপে ক্লিক করে সার্ভে পয়েন্ট যোগ করুন।")}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">{({ street: T("Street", "স্ট্রিট"), satellite: T("Satellite", "স্যাটেলাইট"), terrain: T("Terrain", "ভূপ্রকৃতি"), hybrid: T("Hybrid", "হাইব্রিড") })[basemap]}</span>
                    <Button size="icon" variant="ghost" onClick={toggleMapFullscreen} aria-label={mapFullscreen ? T("Exit fullscreen", "ফুলস্ক্রিন বন্ধ") : T("Fullscreen map", "ম্যাপ ফুলস্ক্রিন")}>{mapFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
                  </div>
                </div>
                <div ref={mapEl} className={`w-full z-0 ${mapFullscreen ? "h-[calc(100vh-6.5rem)]" : "h-[60vh] lg:h-[calc(100vh-14rem)]"}`} />
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
                  <span>{T("Cursor", "কার্সর")}: {pointerCoords ? `${pointerCoords.lat.toFixed(6)}, ${pointerCoords.lng.toFixed(6)}` : "—"}</span>
                  <span>{T("Center", "কেন্দ্র")}: {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)}</span>
                  <span>{T("Zoom", "জুম")}: {mapZoom}</span>
                  <span>{gpsPosition ? `${T("GPS accuracy", "GPS নির্ভুলতা")}: ±${Math.round(gpsPosition.accuracy)} m` : T("GPS not active", "GPS সক্রিয় নয়")}</span>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground">{T("Tap the map to add corner points, or import a single-feature GeoJSON (Point, MultiPoint, LineString, Polygon). Imports replace the current survey points. Map measurements are approximate — confirm with a licensed surveyor.", "ম্যাপে ট্যাপ করে কোণের বিন্দু দিন, অথবা একটি ফিচারসহ GeoJSON (Point, MultiPoint, LineString, Polygon) ইমপোর্ট করুন। ইমপোর্ট করলে বর্তমান সার্ভে পয়েন্ট প্রতিস্থাপিত হবে। ম্যাপের মাপ আনুমানিক — লাইসেন্সধারী সার্ভেয়ার দিয়ে নিশ্চিত করুন।")}</p>
            </div>

            <div className="space-y-4">
              <Card className="p-4 space-y-2">
                <p className="font-semibold text-sm">{mode === "area" ? T("Measured land", "মাপা জমি") : T("Measured distance", "মাপা দূরত্ব")}</p>
                {mode === "area" ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[[T("Square feet", "বর্গফুট"), u.sft], [T("Square metre", "বর্গমিটার"), u.m2], [T("Decimal", "শতাংশ"), u.decimal], [T("Katha", "কাঠা"), u.katha], [T("Bigha", "বিঘা"), u.bigha], [T("Acre", "একর"), u.acre]].map(([k, v]) => (
                      <div key={k as string} className="rounded-md bg-muted/60 p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{fmt(v as number, (v as number) < 10 ? 3 : 0)}</p></div>
                    ))}
                  </div>
                ) : null}
                <p className="text-sm">{T("Perimeter / length", "পরিসীমা / দৈর্ঘ্য")}: <b>{system === "metric" ? `${fmt(len, 2)} m` : `${fmt(len / FT, 1)} ft`}</b> ({system === "metric" ? `${fmt(len / FT, 1)} ft` : `${fmt(len, 1)} m`})</p>
                {pts.length >= 2 && <p className="text-xs text-muted-foreground">{T("Last bearing", "শেষ দিক")}: {bearing(pts[pts.length - 2], pts[pts.length - 1]).toFixed(1)}°</p>}
              </Card>
              <Card className="p-4 space-y-3">
                <div><p className="font-semibold text-sm">{T("Survey point register", "সার্ভে পয়েন্ট রেজিস্টার")}</p><p className="text-xs text-muted-foreground">{T("Edit coordinates, inspect segment distance and bearing, or remove a point.", "স্থানাঙ্ক সম্পাদনা, প্রতিটি অংশের দূরত্ব ও বেয়ারিং দেখুন অথবা পয়েন্ট মুছুন।")}</p></div>
                <div className="max-h-72 overflow-auto space-y-2">
                  {pts.length === 0 ? <p className="text-xs text-muted-foreground">{T("No survey points yet. Choose a tool and click the map.", "এখনো কোনো সার্ভে পয়েন্ট নেই। টুল বেছে ম্যাপে ক্লিক করুন।")}</p> : pts.map((point, index) => {
                    const previous = pts[index - 1];
                    const segment = previous ? distance(previous, point) : 0;
                    const azimuth = previous ? ((bearing(previous, point) % 360) + 360) % 360 : null;
                    return <div key={index} className="rounded-md border p-2 space-y-2">
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold">{T("Point", "পয়েন্ট")} {index + 1}</span><Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => updateSurveyPoints(pts.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                      <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-muted-foreground">Latitude<Input aria-label={"Point " + (index + 1) + " latitude"} type="number" step="0.000001" value={point.lat} onChange={(e) => { const value = Number(e.target.value); if (!Number.isFinite(value) || value < -90 || value > 90) return; const next = [...pts]; next[index] = { ...point, lat: value }; updateSurveyPoints(next); }} /></label><label className="text-[11px] text-muted-foreground">Longitude<Input aria-label={"Point " + (index + 1) + " longitude"} type="number" step="0.000001" value={point.lng} onChange={(e) => { const value = Number(e.target.value); if (!Number.isFinite(value) || value < -180 || value > 180) return; const next = [...pts]; next[index] = { ...point, lng: value }; updateSurveyPoints(next); }} /></label></div>
                      {previous && <p className="text-[11px] text-muted-foreground">{T("Segment", "অংশ")}: {fmt(segment, 2)} m · {T("Azimuth", "আজিমুথ")}: {fmt(azimuth ?? 0, 1)}°</p>}
                    </div>;
                  })}
                </div>
                {pts.length >= 2 && <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1"><p>{T("Total traverse length", "মোট ট্রাভার্স দৈর্ঘ্য")}: <b>{fmt(pathLength(pts), 2)} m</b></p><p>{T("First-to-last bearing", "প্রথম থেকে শেষ বেয়ারিং")}: <b>{fmt((((bearing(pts[0], pts[pts.length - 1]) % 360) + 360) % 360), 1)}°</b></p></div>}
              </Card>
              <AdvancedSurveyTools T={T} />
              <SurveyCalculator T={T} fmt={fmt} />
            </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function SurveyCalculator({ T, fmt }: { T: (e: string, b: string) => string; fmt: (n: number, d?: number) => string }) {
  const { system } = useUnits();
  const lu = system === "metric" ? T("m", "মি") : T("ft", "ফুট");
  const [q, setQ] = useState({ a: 40, b: 60, c: 40, d: 60, diag: 72.1 }); // always stored in feet
  const [conv, setConv] = useState({ v: 5, unit: "katha" });
  const [lv, setLv] = useState({ bm: 10, bs: 1.5, fs: 2.1 });
  const toSft: Record<string, number> = { sft: 1, m2: SFT_PER_M2, decimal: 435.6, katha: 720, bigha: 14400, acre: 43560 };
  const unitNames: Record<string, string> = { sft: T("sft", "বর্গফুট"), m2: "m²", decimal: T("Decimal", "শতাংশ"), katha: T("Katha", "কাঠা"), bigha: T("Bigha", "বিঘা"), acre: T("Acre", "একর") };
  const quad = quadArea(q.a, q.b, q.c, q.d, q.diag);
  const cu = landUnits(conv.v * toSft[conv.unit]);
  const hi = lv.bm + lv.bs, rl = hi - lv.fs;
  const len_ = (ft: number, on: (n: number) => void, label: string) => (
    <LengthInput label={label} unitLabel={lu} valueFt={ft} onChangeFt={on} minFt={0} maxFt={100000} />
  );
  const num = (val: number, on: (n: number) => void, label: string) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label><Input type="number" value={val} onChange={(e) => on(Number(e.target.value) || 0)} /></div>
  );
  return (
    <Card className="p-4">
      <p className="font-semibold text-sm mb-2">{T("Survey calculator", "সার্ভে ক্যালকুলেটর")}</p>
      <Tabs defaultValue="plot">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="plot" className="text-xs">{T("Plot area", "প্লটের মাপ")}</TabsTrigger>
          <TabsTrigger value="conv" className="text-xs">{T("Units", "একক")}</TabsTrigger>
          <TabsTrigger value="level" className="text-xs">{T("Levelling", "লেভেল")}</TabsTrigger>
        </TabsList>
        <TabsContent value="plot" className="space-y-2">
          <p className="text-xs text-muted-foreground">{T(`4 sides + one diagonal (${lu}), for irregular plots`, `৪ বাহু + একটি কর্ণ (${lu}), অসমান প্লটের জন্য`)}</p>
          <div className="grid grid-cols-2 gap-2">
            {len_(q.a, (a) => setQ({ ...q, a }), T("Side A", "বাহু A"))}{len_(q.b, (b) => setQ({ ...q, b }), T("Side B", "বাহু B"))}
            {len_(q.c, (c) => setQ({ ...q, c }), T("Side C", "বাহু C"))}{len_(q.d, (d) => setQ({ ...q, d }), T("Side D", "বাহু D"))}
          </div>
          {len_(q.diag, (diag) => setQ({ ...q, diag }), T("Diagonal A–B corner to C–D corner", "কর্ণ (A-B কোণ থেকে C-D কোণ)"))}
          <p className="text-sm">{T("Area", "ক্ষেত্রফল")}: <b>{fmt(sftToDisplay(quad, system), 0)} {system === "metric" ? "m²" : T("sft", "বর্গফুট")}</b> = {fmt(quad / 720, 2)} {T("katha", "কাঠা")} = {fmt(quad / 435.6, 2)} {T("decimal", "শতাংশ")}</p>
          {quad === 0 && <p className="text-xs text-destructive">{T("These sides cannot form a plot — check the diagonal.", "এই মাপে প্লট হয় না — কর্ণ যাচাই করুন।")}</p>}
        </TabsContent>
        <TabsContent value="conv" className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {num(conv.v, (v) => setConv({ ...conv, v }), T("Value", "মান"))}
            <div className="space-y-1"><Label className="text-xs">{T("Unit", "একক")}</Label>
              <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={conv.unit} onChange={(e) => setConv({ ...conv, unit: e.target.value })}>
                {Object.keys(toSft).map((k) => <option key={k} value={k}>{unitNames[k]}</option>)}
              </select>
            </div>
          </div>
          <div className="text-sm space-y-0.5">
            {(Object.keys(toSft) as (keyof typeof cu)[]).map((k) => <p key={k}>{unitNames[k]}: <b>{fmt(cu[k], 3)}</b></p>)}
          </div>
          <p className="text-xs text-muted-foreground">1 {T("katha", "কাঠা")} = 720 sft · 1 {T("decimal", "শতাংশ")} = 435.6 sft · 1 {T("bigha", "বিঘা")} = 20 {T("katha", "কাঠা")}</p>
        </TabsContent>
        <TabsContent value="level" className="space-y-2">
          <p className="text-xs text-muted-foreground">{T("Height of instrument method", "যন্ত্রের উচ্চতা পদ্ধতি")}</p>
          {num(lv.bm, (bm) => setLv({ ...lv, bm }), T("Benchmark RL (m)", "বেঞ্চমার্ক RL (মি)"))}
          <div className="grid grid-cols-2 gap-2">
            {num(lv.bs, (bs) => setLv({ ...lv, bs }), T("Back sight (m)", "ব্যাক সাইট (মি)"))}
            {num(lv.fs, (fs) => setLv({ ...lv, fs }), T("Fore sight (m)", "ফোর সাইট (মি)"))}
          </div>
          <p className="text-sm">HI = <b>{hi.toFixed(3)} m</b> · {T("New RL", "নতুন RL")} = <b>{rl.toFixed(3)} m</b></p>
          <p className="text-xs text-muted-foreground">{rl >= lv.bm ? T("Point is higher than benchmark (fill not needed)", "বিন্দুটি বেঞ্চমার্কের চেয়ে উঁচু") : T(`Point is ${(lv.bm - rl).toFixed(3)} m lower — may need earth filling`, `বিন্দুটি ${(lv.bm - rl).toFixed(3)} মি নিচু — মাটি ভরাট লাগতে পারে`)}</p>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
