import { DoorOpen, Ruler, ScanSearch } from "lucide-react";
import type { CadEntity, CadDocument } from "@/lib/cad2d/geometry";
import { detectRooms, formatRoomArea } from "@/lib/cad2d/room-analysis";

type Props = { entities: CadEntity[]; units: CadDocument["units"] };

export default function CadRoomSchedule({ entities, units }: Props) {
  const rooms = detectRooms(entities);
  const totalArea = rooms.reduce((sum, room) => sum + room.area, 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><DoorOpen className="h-4 w-4 text-orange-500" />Room schedule</h3>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">{rooms.length} detected</span>
      </div>
      {rooms.length === 0 ? (
        <div className="rounded-lg bg-slate-50 px-3 py-4 text-center">
          <ScanSearch className="mx-auto mb-1 h-5 w-5 text-slate-400" />
          <p className="text-xs font-medium text-slate-600">No closed room boundaries found</p>
          <p className="mt-1 text-[10px] text-slate-500">Create a rectangle, polygon, or closed polyline to calculate its area.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">{rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
              <div className="min-w-0"><p className="text-xs font-medium text-slate-700">{room.name}</p><p className="text-[10px] text-slate-500">{room.boundaryType.replace("-", " ")}</p></div>
              <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">{formatRoomArea(room.area, units)}</p>
            </div>
          ))}</div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs"><span className="flex items-center gap-1 text-slate-500"><Ruler className="h-3.5 w-3.5" />Total enclosed area</span><strong>{formatRoomArea(totalArea, units)}</strong></div>
        </>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Area is calculated from explicitly closed shapes only. Open wall networks, door/window openings, wall thickness deductions, and overlapping boundaries are not inferred.</p>
    </section>
  );
}
