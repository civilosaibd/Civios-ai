import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertCircle, BookOpen, Download, FileSpreadsheet, Loader2,
  Search, ShieldCheck, Trash2, UploadCloud, X,
} from "lucide-react";

const BUCKET = "excel-library";
const PAGE_SIZE = 40;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "xlsm"]);
const MIME_BY_EXTENSION: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
};

type LibraryFile = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  original_filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const safeFileName = (name: string) =>
  name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-120) || "workbook";

const getExtension = (name: string) => name.split(".").pop()?.toLowerCase() || "";

const ExcelLibraryPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?redirect=/admin/excel-library");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) { setIsAdmin(false); setPermissionLoading(false); return; }
    let active = true;
    setPermissionLoading(true);
    void supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data, error }) => {
      if (!active) return;
      setIsAdmin(!error && data === true);
      setPermissionLoading(false);
    }).catch(() => {
      if (active) {
        setIsAdmin(false);
        setPermissionLoading(false);
      }
    });
    return () => { active = false; };
  }, [user]);

  const loadFiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from("excel_library_files").select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    const term = search.trim().replace(/[,%()]/g, " ");
    if (term) query = query.or("title.ilike.%"+term+"%,original_filename.ilike.%"+term+"%,category.ilike.%"+term+"%");
    if (categoryFilter) query = query.eq("category", categoryFilter);
    const from = page * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) toast.error("Excel library load failed: " + error.message);
    else {
      setFiles((data || []) as LibraryFile[]);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [user, search, categoryFilter, page]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const categories = useMemo(
    () => Array.from(new Set(files.map((file) => file.category).filter((value): value is string => !!value))).sort(),
    [files],
  );

  const chooseFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    const invalid = next.filter((file) => !ALLOWED_EXTENSIONS.has(getExtension(file.name)) || file.size > MAX_FILE_BYTES || file.size === 0);
    if (invalid.length) {
      toast.error(invalid.length + "টি ফাইল বাদ দেওয়া হয়েছে। শুধু XLS/XLSX/XLSM এবং সর্বোচ্চ 50 MB ফাইল গ্রহণ করা হবে।");
    }
    const valid = next.filter((file) => ALLOWED_EXTENSIONS.has(getExtension(file.name)) && file.size > 0 && file.size <= MAX_FILE_BYTES);
    setSelectedFiles((current) => {
      const known = new Set(current.map((file) => file.name + ":" + file.size + ":" + file.lastModified));
      return [...current, ...valid.filter((file) => !known.has(file.name + ":" + file.size + ":" + file.lastModified))];
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const uploadFiles = async () => {
    if (!user || !isAdmin || !selectedFiles.length || uploading) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: selectedFiles.length, failed: 0 });
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const queue = [...selectedFiles];
    const worker = async () => {
      while (cursor < queue.length) {
        const file = queue[cursor++];
        const extension = getExtension(file.name);
        const path = "library/" + crypto.randomUUID() + "/" + safeFileName(file.name);
        const mimeType = file.type || MIME_BY_EXTENSION[extension];
        let uploaded = false;
        try {
          const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false,
          });
          if (uploadError) throw uploadError;
          uploaded = true;
          const { error: insertError } = await supabase.from("excel_library_files").insert({
            title: file.name.replace(/\.[^.]+$/, ""),
            description: description.trim() || null,
            category: category.trim() || null,
            original_filename: file.name,
            storage_path: path,
            size_bytes: file.size,
            mime_type: mimeType,
            uploaded_by: user.id,
          });
          if (insertError) throw insertError;
        } catch (error) {
          failed += 1;
          if (uploaded) await supabase.storage.from(BUCKET).remove([path]);
          console.error("Excel library upload failed for", file.name, error);
        } finally {
          done += 1;
          setUploadProgress({ done, total: queue.length, failed });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
    setUploading(false);
    setSelectedFiles([]);
    setDescription("");
    await loadFiles();
    if (failed) toast.warning(done - failed + "টি ফাইল আপলোড হয়েছে, " + failed + "টি ব্যর্থ হয়েছে।");
    else toast.success(done + "টি Excel ফাইল সফলভাবে আপলোড হয়েছে।");
  };

  const downloadFile = async (file: LibraryFile) => {
    setBusyId(file.id);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 60, {
      download: file.original_filename,
    });
    if (error || !data?.signedUrl) toast.error("ডাউনলোড লিংক তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    else window.location.assign(data.signedUrl);
    setBusyId(null);
  };

  const deleteFile = async (file: LibraryFile) => {
    if (!isAdmin || !window.confirm('"' + file.original_filename + '" ফাইলটি স্থায়ীভাবে মুছে ফেলবেন?')) return;
    setBusyId(file.id);
    const { error: objectError } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (objectError) {
      toast.error("Storage file delete failed: " + objectError.message);
      setBusyId(null);
      return;
    }
    const { error } = await supabase.from("excel_library_files").delete().eq("id", file.id);
    if (error) toast.error("File metadata delete failed: " + error.message);
    else {
      toast.success("ফাইল মুছে ফেলা হয়েছে।");
      await loadFiles();
    }
    setBusyId(null);
  };

  if (authLoading || permissionLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const progressPercent = uploadProgress.total ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <SEO title="Excel Template Library | CivilOS AI" description="Download engineering Excel workbooks and templates from the CivilOS AI library." />
      <Navbar />
      <main className="container flex-1 space-y-6 py-6 md:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold md:text-3xl">Excel Template Library</h1>
            <p className="text-sm text-muted-foreground">Civil engineering spreadsheets, ready to download and use.</p>
          </div>
          <Badge variant="secondary">{total.toLocaleString()} files</Badge>
        </div>

        {isAdmin && (
          <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-6">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Admin · Bulk upload</h2></div>
            <p className="text-sm text-muted-foreground">একসঙ্গে অনেকগুলো XLS, XLSX বা XLSM ফাইল নির্বাচন করে আপলোড করুন। প্রতিটি ফাইল আলাদাভাবে সংরক্ষিত হবে। প্রতি ফাইল সর্বোচ্চ 50 MB।</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="font-medium">Category (optional)</span><Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="যেমন: BOQ, BBS, Estimation, AutoCAD" maxLength={80} /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Shared description (optional)</span><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="এই ব্যাচের ফাইলগুলোর সংক্ষিপ্ত বিবরণ" rows={2} maxLength={500} /></label>
            </div>
            <input ref={inputRef} type="file" multiple accept=".xls,.xlsx,.xlsm" className="hidden" onChange={(event) => chooseFiles(event.target.files)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}><UploadCloud className="mr-2 h-4 w-4" />Select Excel files</Button>
              <span className="text-sm text-muted-foreground">{selectedFiles.length.toLocaleString()} selected</span>
              <Button type="button" onClick={() => void uploadFiles()} disabled={!selectedFiles.length || uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload selected"}
              </Button>
              {selectedFiles.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFiles([])} disabled={uploading}><X className="mr-1 h-4 w-4" />Clear</Button>}
            </div>
            {selectedFiles.length > 0 && <div className="max-h-36 overflow-auto rounded-lg border p-2 text-xs text-muted-foreground">{selectedFiles.slice(0, 20).map((file) => <div key={file.name + file.lastModified} className="flex justify-between gap-3 py-1"><span className="truncate">{file.name}</span><span className="shrink-0">{formatBytes(file.size)}</span></div>)}{selectedFiles.length > 20 && <p className="pt-1">আরও {selectedFiles.length - 20}টি ফাইল…</p>}</div>}
            {uploadProgress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span>Upload progress · {uploadProgress.done}/{uploadProgress.total}</span><span>{progressPercent}% · {uploadProgress.failed} failed</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: progressPercent + "%" }} /></div>
              </div>
            )}
          </section>
        )}

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search by file name, title or category…" /></div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(0); }} aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> :
            files.length === 0 ? <div className="rounded-xl border border-dashed bg-card p-10 text-center"><FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">No Excel files found</p><p className="mt-1 text-sm text-muted-foreground">নতুন ফাইল আপলোড হলে এখানে দেখা যাবে।</p></div> :
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((file) => (
                <article key={file.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><FileSpreadsheet className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{file.title}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{file.original_filename}</p></div>
                  </div>
                  {file.description && <p className="line-clamp-2 text-sm text-muted-foreground">{file.description}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {file.category && <Badge variant="secondary">{file.category}</Badge>}
                    <span>{formatBytes(file.size_bytes)}</span><span>·</span><span>{new Date(file.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" size="sm" onClick={() => void downloadFile(file)} disabled={busyId === file.id}>
                      {busyId === file.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download
                    </Button>
                    {isAdmin && <Button size="icon" variant="outline" aria-label={"Delete " + file.original_filename} onClick={() => void deleteFile(file)} disabled={busyId === file.id}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </article>
              ))}
            </div>
          }
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
          </div>
        </section>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>ফাইলগুলো private storage-এ থাকে। ডাউনলোডের সময় স্বল্পমেয়াদি secure link তৈরি হয়; সরাসরি public file URL প্রকাশ করা হয় না।</p></div>
      </main>
      <Footer />
    </div>
  );
};

export default ExcelLibraryPage;
