import { useRef, useState } from "react";
import { FileImage, FileText, FileCode2, Loader2, Replace, Trash2, Eye, UploadCloud, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCEPT, validateFile, type UploadLimits } from "@/lib/viz/validate";
import { downscaleForAnalysis, rasterizePdf, readImageSize } from "@/lib/viz/raster";
import { parseDxfToModel } from "@/lib/viz/dxf";
import { downloadText, listFiles, removeFile, signedUrl, uploadFile, type VizFile } from "@/lib/viz/api";
import { Warn, useL } from "./bits";

type Stage = "validating" | "preparing" | "uploading" | "done" | "error";
interface Item { key: string; name: string; stage: Stage; msg?: string }

const mb = (n: number) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;

export default function UploadPanel({ vizId, files, limits, canEdit, onChange }: { vizId: string; files: VizFile[]; limits: UploadLimits; canEdit: boolean; onChange: () => void }) {
  const L = useL();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<{ title: string; url?: string; text?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<VizFile | null>(null);
  const sources = files.filter((f) => f.role === "source");

  const upd = (key: string, patch: Partial<Item>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function processOne(file: File, existing: number, key: string) {
    try {
      const v = await validateFile(file, limits, existing);
      if (v.ok === false) throw new Error(v.error);
      if (v.kind === "dwg") throw new Error(L(`"${file.name}": DWG is a closed format and cannot be read in the browser. Open it in AutoCAD/BricsCAD/LibreCAD and export as ASCII DXF, then upload the DXF.`, `"${file.name}": DWG সরাসরি পড়া যায় না। AutoCAD/BricsCAD/LibreCAD-এ খুলে ASCII DXF হিসেবে এক্সপোর্ট করে DXF আপলোড করুন।`));
      upd(key, { stage: "preparing" });
      if (v.kind === "dxf") {
        const text = await file.text();
        const r = parseDxfToModel(text); // throws a readable error for invalid DXF
        if (r.model.walls.length === 0) throw new Error(L("No wall geometry was found in this DXF (layers like WALL / A-WALL are expected).", "এই DXF-এ দেয়ালের জ্যামিতি পাওয়া যায়নি (WALL / A-WALL ধরনের লেয়ার দরকার)।"));
        upd(key, { stage: "uploading" });
        await uploadFile(vizId, file, { name: file.name, type: "dxf" });
      } else if (v.kind === "image") {
        const size = await readImageSize(file).catch(() => { throw new Error(L("This image could not be decoded.", "ছবিটি ডিকোড করা যায়নি।")); });
        const small = await downscaleForAnalysis(file);
        upd(key, { stage: "uploading" });
        const src = await uploadFile(vizId, file, { name: file.name, type: "image", ...size });
        if (small) await uploadFile(vizId, small.blob, { name: `${file.name} (analysis copy)`, type: "image", width: small.width, height: small.height, role: "derived", derivedFrom: src.id });
      } else {
        const r = await rasterizePdf(file);
        upd(key, { stage: "uploading" });
        const src = await uploadFile(vizId, file, { name: file.name, type: "pdf", width: r.width, height: r.height });
        await uploadFile(vizId, r.blob, { name: `${file.name} (page 1)`, type: "image", width: r.width, height: r.height, role: "derived", derivedFrom: src.id });
        if (r.pages > 1) upd(key, { stage: "done", msg: L(`Only page 1 of ${r.pages} is used.`, `${r.pages} পাতার মধ্যে শুধু ১ম পাতা ব্যবহার হবে।`) });
      }
      setItems((a) => a.map((i) => (i.key === key ? { ...i, stage: "done" } : i)));
    } catch (e) { upd(key, { stage: "error", msg: e instanceof Error ? e.message : String(e) }); }
  }

  async function handle(list: FileList | File[]) {
    if (!canEdit) return;
    const arr = Array.from(list);
    const mk = arr.map((f) => ({ f, key: `${f.name}-${f.size}-${crypto.randomUUID()}` }));
    setItems((a) => [...a, ...mk.map(({ f, key }) => ({ key, name: f.name, stage: "validating" as Stage }))]);
    let count = sources.length;
    for (const { f, key } of mk) { await processOne(f, count, key); count++; }
    onChange();
  }

  async function doReplace(old: VizFile, f: File) {
    const key = `replace-${old.id}-${Date.now()}`;
    setItems((a) => [...a, { key, name: f.name, stage: "validating" }]);
    try {
      const v = await validateFile(f, limits, 0); // validate BEFORE removing the old file
      if (v.ok === false) throw new Error(v.error);
      await removeFile(old);
      await processOne(f, sources.length - 1, key);
    } catch (e) { upd(key, { stage: "error", msg: e instanceof Error ? e.message : String(e) }); }
    onChange();
  }

  async function remove(f: VizFile) {
    try { await removeFile(f); onChange(); } catch (e) { setItems((a) => [...a, { key: `rm-${f.id}`, name: f.file_name, stage: "error", msg: e instanceof Error ? e.message : String(e) }]); }
  }

  async function open(f: VizFile) {
    try {
      if (f.file_type === "dxf") {
        const r = parseDxfToModel(await downloadText(f.file_url));
        setPreview({ title: f.file_name, text: `${L("Entities", "এন্টিটি")}: ${r.entityCount}\n${L("Walls", "দেয়াল")}: ${r.model.walls.length}\n${L("Columns", "কলাম")}: ${r.model.columns.length}\n${L("Doors / windows", "দরজা / জানালা")}: ${r.model.doors.length} / ${r.model.windows.length}\n${L("Units in file", "ফাইলের ইউনিট")}: ${r.unitsFromFile ? "yes" : L("not specified", "উল্লেখ নেই")}\n${L("Layers", "লেয়ার")}: ${Object.keys(r.layers).join(", ")}` });
      } else {
        const all = await listFiles(vizId);
        const target = f.file_type === "pdf" ? all.find((x) => x.derived_from === f.id) ?? f : f;
        setPreview({ title: f.file_name, url: await signedUrl(target.file_url) });
      }
    } catch (e) { setPreview({ title: f.file_name, text: e instanceof Error ? e.message : String(e) }); }
  }

  const Icon = ({ t }: { t: VizFile["file_type"] }) => (t === "image" ? <FileImage className="h-5 w-5" /> : t === "pdf" ? <FileText className="h-5 w-5" /> : <FileCode2 className="h-5 w-5" />);
  const busy = items.some((i) => ["validating", "preparing", "uploading"].includes(i.stage));

  return (
    <div className="space-y-4">
      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
          onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${drag ? "border-primary bg-primary/5" : "hover:border-primary/60"}`}
          data-testid="viz-dropzone"
        >
          <UploadCloud className="h-9 w-9 mx-auto text-muted-foreground" />
          <p className="mt-2 font-medium">{L("Drag & drop drawings here, or click to browse", "ড্রয়িং এখানে ড্র্যাগ করুন বা ক্লিক করে বাছুন")}</p>
          <p className="text-xs text-muted-foreground mt-1">JPG · PNG · WEBP · PDF · DXF — {L(`max ${limits.maxFileMb} MB each, up to ${limits.maxFiles} files`, `প্রতিটি সর্বোচ্চ ${limits.maxFileMb} MB, ${limits.maxFiles}টি ফাইল পর্যন্ত`)}</p>
          <p className="text-xs text-muted-foreground">{L("DWG: export to DXF first.", "DWG হলে আগে DXF এক্সপোর্ট করুন।")}</p>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" data-testid="viz-file-input" onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ""; }} />
        </div>
      )}
      <input ref={replaceInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && replacing.current) void doReplace(replacing.current, f); e.target.value = ""; }} />

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-sm rounded-md border px-3 py-2">
              {i.stage === "error" ? <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" /> : i.stage === "done" ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" /> : <Loader2 className="h-4 w-4 mt-0.5 animate-spin shrink-0" />}
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div>
                <div className={`text-xs ${i.stage === "error" ? "text-destructive" : "text-muted-foreground"}`}>{i.msg ?? { validating: L("Validating…", "যাচাই হচ্ছে…"), preparing: L("Preparing…", "প্রস্তুত হচ্ছে…"), uploading: L("Uploading…", "আপলোড হচ্ছে…"), done: L("Uploaded", "আপলোড সম্পন্ন"), error: "" }[i.stage]}</div></div>
              {(i.stage === "error" || i.stage === "done") && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setItems((a) => a.filter((x) => x.key !== i.key))} aria-label="Dismiss"><X className="h-3 w-3" /></Button>}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        {sources.length === 0 && !busy && <p className="text-sm text-muted-foreground text-center py-4">{L("No files yet.", "এখনো কোনো ফাইল নেই।")}</p>}
        {sources.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="text-muted-foreground"><Icon t={f.file_type} /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{f.file_name}</div>
              <div className="text-xs text-muted-foreground">{mb(f.file_size)}{f.width ? ` · ${f.width}×${f.height}px` : ""}{f.file_type === "pdf" ? " · page 1" : ""}</div>
              {f.error && <div className="text-xs text-destructive">{f.error}</div>}
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex capitalize">{f.processing_status}</Badge>
            <Button size="icon" variant="ghost" onClick={() => void open(f)} aria-label="Preview"><Eye className="h-4 w-4" /></Button>
            {canEdit && <Button size="icon" variant="ghost" onClick={() => { replacing.current = f; replaceInput.current?.click(); }} aria-label="Replace"><Replace className="h-4 w-4" /></Button>}
            {canEdit && <Button size="icon" variant="ghost" onClick={() => void remove(f)} aria-label="Remove"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          </div>
        ))}
      </div>
      {sources.some((f) => f.file_type === "dxf") && sources.some((f) => f.file_type !== "dxf") && <Warn>{L("DXF and image files were both uploaded. The DXF (exact CAD geometry) is used as the primary source; images are kept for reference.", "DXF ও ছবি দুটোই আছে। নির্ভুল CAD জ্যামিতির জন্য DXF মূল সোর্স হিসেবে ব্যবহার হবে; ছবি রেফারেন্স হিসেবে থাকবে।")}</Warn>}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle className="truncate">{preview?.title}</DialogTitle></DialogHeader>
          {preview?.url && <img src={preview.url} alt={preview.title} className="max-h-[70vh] w-full object-contain rounded" />}
          {preview?.text && <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3">{preview.text}</pre>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
