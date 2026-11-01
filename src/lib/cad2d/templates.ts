import type { CadDocument, CadEntity } from "@/lib/cad2d/geometry";

export type IndoCadTemplateId = "two-bedroom-home" | "compact-office";

type NewCadEntity = CadEntity extends infer Entity ? Entity extends CadEntity ? Omit<Entity, "id" | "layerId"> : never : never;

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `indocad-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function buildDocument(
  width: number,
  height: number,
  walls: Array<[number, number, number, number]>,
  doors: Array<[number, number, number, "left" | "right"]>,
  windows: Array<[number, number, number, number]>,
  labels: Array<[number, number, string]>,
): CadDocument {
  const layerId = "indocad-architecture";
  const entities: CadEntity[] = [];
  const add = (entity: NewCadEntity) => {
    entities.push({ ...entity, id: makeId(), layerId } as CadEntity);
  };
  walls.forEach(([x1, y1, x2, y2]) => add({ type: "wall", start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.35 }));
  doors.forEach(([x, y, doorWidth, swing]) => add({ type: "door", at: { x, y }, width: doorWidth, rotation: 0, swing }));
  windows.forEach(([x, y, windowWidth, rotation]) => add({ type: "window", at: { x, y }, width: windowWidth, rotation }));
  labels.forEach(([x, y, text]) => add({ type: "text", at: { x, y }, text, height: 0.8, rotation: 0 }));
  add({ type: "dimension", a: { x: 0, y: -2 }, b: { x: width, y: -2 }, offset: 0.7 });
  add({ type: "dimension", a: { x: -2, y: 0 }, b: { x: -2, y: height }, offset: 0.7 });
  return {
    version: 2, units: "ft", entities,
    layers: [{ id: layerId, name: "Architecture", visible: true, color: "#1e293b", lineWeight: 1.5 }],
  };
}

export function createIndoCadTemplate(templateId: IndoCadTemplateId): CadDocument {
  if (templateId === "two-bedroom-home") {
    return buildDocument(40, 30,
      [
        [0, 0, 40, 0], [40, 0, 40, 30], [40, 30, 0, 30], [0, 30, 0, 0],
        [0, 15, 15, 15], [15, 15, 15, 30], [15, 0, 15, 10], [15, 10, 40, 10],
        [27, 10, 27, 30], [27, 20, 40, 20], [15, 20, 27, 20],
      ],
      [[7.5, 15, 3, "left"], [15, 6, 3, "right"], [27, 15, 3, "left"], [33.5, 20, 2.8, "right"]],
      [[7.5, 0, 5, 0], [32, 0, 5, 0], [0, 22, 4, Math.PI / 2], [40, 5, 4, Math.PI / 2], [33.5, 30, 5, 0]],
      [[5, 8, "BEDROOM 01"], [20, 5, "LIVING / DINING"], [32, 5, "KITCHEN"], [20, 24, "BEDROOM 02"], [33, 24, "BATH"]],
    );
  }
  return buildDocument(36, 24,
    [
      [0, 0, 36, 0], [36, 0, 36, 24], [36, 24, 0, 24], [0, 24, 0, 0],
      [0, 8, 10, 8], [10, 8, 10, 24], [22, 8, 22, 24], [10, 16, 22, 16], [22, 8, 36, 8],
    ],
    [[5, 8, 3, "left"], [22, 12, 3, "right"], [28, 8, 3, "left"]],
    [[18, 0, 6, 0], [0, 17, 4, Math.PI / 2], [36, 17, 4, Math.PI / 2]],
    [[3, 4, "RECEPTION"], [13, 4, "OPEN OFFICE"], [12, 20, "MEETING ROOM"], [27, 17, "MANAGER"], [26, 4, "PANTRY"]],
  );
}
