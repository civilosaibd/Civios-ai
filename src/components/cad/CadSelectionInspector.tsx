import { entityBounds, type CadEntity, type CadLayer, type CadDocument } from "@/lib/cad2d/geometry";
import { Layers3, Ruler, Shapes } from "lucide-react";

type Props = {
  entities: CadEntity[];
  layers: CadLayer[];
  units: CadDocument["units"];
  onMoveToLayer: (layerId: string) => void;
};

export default function CadSelectionInspector({ entities, layers, units, onMoveToLayer }: Props) {
  const selected = entities;
  const bounds = selected.map(entityBounds);
  const width = bounds.length ? Math.max(...bounds.map((item) => item.max.x)) - Math.min(...bounds.map((item) => item.min.x)) : 0;
  const height = bounds.length ? Math.max(...bounds.map((item) => item.max.y)) - Math.min(...bounds.map((item) => item.min.y)) : 0;
  const layerIds = [...new Set(selected.map((entity) => entity.layerId))];
  const layerValue = layerIds.length === 1 ? layerIds[0] : "";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Selection properties">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Shapes className="h-4 w-4 text-orange-500" /> Selection properties
      </h3>
      {selected.length === 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">Select an object on the drawing canvas to inspect its type, layer and overall dimensions.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Selected</p>
              <p className="text-lg font-semibold text-slate-900">{selected.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Types</p>
              <p className="truncate text-xs font-semibold text-slate-900">{[...new Set(selected.map((entity) => entity.type))].join(", ")}</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 p-2">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500"><Ruler className="h-3 w-3" /> Selection extents</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-500">Width</span><p className="font-semibold text-slate-800">{width.toFixed(3)} {units}</p></div>
              <div><span className="text-slate-500">Height</span><p className="font-semibold text-slate-800">{height.toFixed(3)} {units}</p></div>
            </div>
          </div>
          <label className="block text-xs font-medium text-slate-700">
            <span className="mb-1 flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /> Move selection to layer</span>
            <select
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
              value={layerValue}
              disabled={layers.length === 0}
              onChange={(event) => onMoveToLayer(event.target.value)}
              aria-label="Move selected objects to layer"
            >
              {layerIds.length !== 1 && <option value="">Multiple layers selected</option>}
              {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
            </select>
          </label>
          <p className="text-[10px] text-slate-500">Extents are the combined axis-aligned bounds of the selected objects. Geometry is not resized.</p>
        </div>
      )}
    </section>
  );
}
