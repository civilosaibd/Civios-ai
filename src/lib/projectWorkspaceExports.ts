import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from "docx";
import { saveAs } from "file-saver";
import type { ProjectArtifact } from "@/lib/projectArtifacts";

type ProjectLike = {
  id: string; name: string; client_name?: string | null; location?: string | null;
  project_type?: string | null; status?: string | null; budget?: number | null;
  start_date?: string | null; end_date?: string | null;
};
type DocumentLike = { id: string; file_name: string; file_type?: string | null; file_size?: number | null; created_at?: string | null };

const safeFileBase = (name: string) => (name || "CivilOS-Project").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "CivilOS-Project";
const artifactRows = (artifacts: ProjectArtifact[]) => artifacts.map((item) => ({
  Type: item.artifact_type, Title: item.title, Description: item.description || "",
  "Created At": item.created_at, "Updated At": item.updated_at,
  "Has Attached File": item.storage_path ? "Yes" : "No",
  Data: JSON.stringify(item.data ?? {}),
  Metadata: JSON.stringify(item.metadata ?? {}),
}));

export function exportProjectWorkspaceExcel(project: ProjectLike, artifacts: ProjectArtifact[], documents: DocumentLike[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "Project ID": project.id, Name: project.name, Client: project.client_name || "",
    Location: project.location || "", Type: project.project_type || "", Status: project.status || "",
    Budget: project.budget ?? "", "Start Date": project.start_date || "", "End Date": project.end_date || "",
  }]), "Project");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(artifactRows(artifacts)), "Workspace Artifacts");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documents.map((doc) => ({
    "Document ID": doc.id, Name: doc.file_name, Type: doc.file_type || "",
    "Size (bytes)": doc.file_size ?? "", "Uploaded At": doc.created_at || "",
  }))), "Documents");
  XLSX.writeFile(workbook, `${safeFileBase(project.name)}-Workspace.xlsx`);
}

export function exportProjectWorkspacePdf(project: ProjectLike, artifacts: ProjectArtifact[], documents: DocumentLike[]) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.setFontSize(18); pdf.text("CivilOS AI — Project Workspace", 14, 17);
  pdf.setFontSize(10);
  const details = [
    `Project: ${project.name}`, `Project ID: ${project.id}`,
    `Client: ${project.client_name || "—"}`, `Location: ${project.location || "—"}`,
    `Type: ${project.project_type || "—"}`, `Status: ${project.status || "—"}`,
    `Budget: ${project.budget ?? "—"}`, `Period: ${project.start_date || "—"} to ${project.end_date || "—"}`,
  ];
  pdf.text(details, 14, 25);
  autoTable(pdf, {
    startY: 62, head: [["#", "Artifact Type", "Title", "Description", "Updated"]],
    body: artifacts.map((item, index) => [String(index + 1), item.artifact_type, item.title, item.description || "—", item.updated_at || "—"]),
    styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [31, 55, 85] },
  });
  const finalY = (pdf as any).lastAutoTable?.finalY || 70;
  autoTable(pdf, {
    startY: finalY + 8, head: [["#", "Document", "Type", "Size (bytes)", "Uploaded"]],
    body: documents.map((doc, index) => [String(index + 1), doc.file_name, doc.file_type || "—", String(doc.file_size ?? "—"), doc.created_at || "—"]),
    styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [31, 55, 85] },
  });
  pdf.save(`${safeFileBase(project.name)}-Workspace.pdf`);
}

export async function exportProjectWorkspaceWord(project: ProjectLike, artifacts: ProjectArtifact[], documents: DocumentLike[]) {
  const paragraphs = [
    new Paragraph({ text: "CivilOS AI — Project Workspace", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Project: ${project.name}` }),
    new Paragraph({ text: `Project ID: ${project.id}` }),
    new Paragraph({ text: `Client: ${project.client_name || "—"} | Location: ${project.location || "—"}` }),
    new Paragraph({ text: `Type: ${project.project_type || "—"} | Status: ${project.status || "—"}` }),
    new Paragraph({ text: `Budget: ${project.budget ?? "—"} | Dates: ${project.start_date || "—"} to ${project.end_date || "—"}` }),
    new Paragraph({ text: "Workspace Artifacts", heading: HeadingLevel.HEADING_1 }),
  ];
  const artifactTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: ["Type", "Title", "Description", "Updated"].map((text) => new TableCell({ children: [new Paragraph({ text })] })) }),
      ...artifacts.map((item) => new TableRow({ children: [item.artifact_type, item.title, item.description || "—", item.updated_at || "—"].map((text) => new TableCell({ children: [new Paragraph({ text })] })) })),
    ],
  });
  paragraphs.push(new Paragraph({ text: "Project Documents", heading: HeadingLevel.HEADING_1 }));
  const documentTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: ["File", "Type", "Size (bytes)", "Uploaded"].map((text) => new TableCell({ children: [new Paragraph({ text })] })) }),
      ...documents.map((doc) => new TableRow({ children: [doc.file_name, doc.file_type || "—", String(doc.file_size ?? "—"), doc.created_at || "—"].map((text) => new TableCell({ children: [new Paragraph({ text })] })) })),
    ],
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children: [...paragraphs, artifactTable, documentTable] }] }));
  saveAs(blob, `${safeFileBase(project.name)}-Workspace.docx`);
}
