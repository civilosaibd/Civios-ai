import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Building2, Plus, Loader2, MapPin, User2, Calendar, Search, X } from "lucide-react";
import { toast } from "sonner";

interface ProjectRow {
  id: string; name: string; client_name: string | null; location: string | null;
  project_type: string | null; status: string; budget: number | null;
  start_date: string | null; end_date: string | null; updated_at: string;
}

const statusColor: Record<string, string> = {
  planning: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  active: "bg-green-500/15 text-green-600 border-green-500/30",
  completed: "bg-gray-500/15 text-gray-600 border-gray-500/30",
};

const statusBn: Record<string, string> = {
  planning: "পরিকল্পনা", active: "চলমান", completed: "সম্পন্ন",
};

const ProjectsPage = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", client_name: "", location: "", project_type: "Residential",
    start_date: "", end_date: "", budget: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

  const load = async () => {
    const { data, error } = await supabase.from("projects")
      .select("id,name,client_name,location,project_type,status,budget,start_date,end_date,updated_at")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message); else setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { if (user) load(); }, [user]);

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredItems = normalizedQuery
    ? items.filter((project) => [project.name, project.client_name, project.location, project.project_type, project.status]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
    : items;

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value); else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const create = async () => {
    if (saving) return;
    if (!user) {
      toast.error("প্রজেক্ট তৈরি করতে আবার সাইন ইন করুন।");
      navigate("/auth");
      return;
    }

    const name = form.name.trim();
    if (!name) {
      toast.error("Project name required");
      return;
    }

    const budget = form.budget.trim() ? Number(form.budget) : null;
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      toast.error("Budget must be a valid non-negative amount.");
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      toast.error("End date cannot be earlier than the start date.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name,
        client_name: form.client_name.trim() || null,
        location: form.location.trim() || null,
        project_type: form.project_type,
        status: "planning",
        budget,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        inputs: {},
      };
      const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
      if (error) {
        console.error("Project creation failed", error);
        toast.error("প্রজেক্ট তৈরি করা যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।");
        return;
      }
      if (!data?.id) {
        toast.error("প্রজেক্ট তৈরি হয়েছে কি না নিশ্চিত করা যায়নি। Projects তালিকা রিফ্রেশ করুন।");
        return;
      }

      toast.success("প্রজেক্ট তৈরি হয়েছে");
      setOpen(false);
      setForm({
        name: "", client_name: "", location: "", project_type: "Residential",
        start_date: "", end_date: "", budget: "",
      });
      navigate(`/projects/${data.id}`);
    } catch (error) {
      console.error("Unexpected project creation error", error);
      toast.error("নেটওয়ার্ক সমস্যার কারণে প্রজেক্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10">
        <div className="container max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl md:text-3xl font-bold">My Projects</h1>
              <p className="text-sm text-muted-foreground">সব প্রজেক্ট এক জায়গায় — BOQ, BBS, estimate, documents.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative w-full sm:w-64">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(event) => updateSearch(event.target.value)} placeholder="Search projects…" aria-label="Search projects" className="pl-9 pr-9" />
                {searchQuery && <button type="button" aria-label="Clear project search" onClick={() => updateSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
              </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" /> New Project</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create New Project</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label htmlFor="project-name">Project Name *</Label><Input id="project-name" value={form.name} maxLength={120} required onChange={e=>setForm({...form,name:e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="project-client">Client Name</Label><Input id="project-client" value={form.client_name} maxLength={120} onChange={e=>setForm({...form,client_name:e.target.value})} /></div>
                    <div><Label htmlFor="project-location">Location</Label><Input id="project-location" value={form.location} maxLength={160} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Dhaka, BD" /></div>
                  </div>
                  <div>
                    <Label>Project Type</Label>
                    <Select value={form.project_type} onValueChange={v=>setForm({...form,project_type:v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Residential">Residential (আবাসিক)</SelectItem>
                        <SelectItem value="Commercial">Commercial (বাণিজ্যিক)</SelectItem>
                        <SelectItem value="Industrial">Industrial (শিল্প)</SelectItem>
                        <SelectItem value="Infrastructure">Infrastructure (অবকাঠামো)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="project-start-date">Start Date</Label><Input id="project-start-date" type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} /></div>
                    <div><Label htmlFor="project-end-date">End Date</Label><Input id="project-end-date" type="date" min={form.start_date || undefined} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} /></div>
                  </div>
                  <div><Label htmlFor="project-budget">Budget (BDT ৳)</Label><Input id="project-budget" type="number" min="0" step="0.01" inputMode="decimal" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} /></div>
                  <Button onClick={create} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : "Create Project"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
          ) : items.length === 0 ? (
            <div className="bg-card rounded-xl shadow-card p-12 text-center space-y-3">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">Create your first project to organize BOQs, estimates and documents.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center space-y-3">
              <Search className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="font-medium">No matching projects</p>
              <p className="text-sm text-muted-foreground">Try another project name, client, location or project type.</p>
              <Button variant="outline" size="sm" onClick={() => updateSearch("")}>Clear search</Button>
            </div>
          ) : (
            <>
              {normalizedQuery && <p className="text-sm text-muted-foreground">Showing {filteredItems.length} of {items.length} projects for “{searchQuery.trim()}”.</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`}
                  className="bg-card rounded-xl shadow-card p-5 space-y-3 hover:shadow-lg transition-shadow border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-accent" />
                    </div>
                    <Badge className={statusColor[p.status] || statusColor.planning} variant="outline">
                      {statusBn[p.status] || p.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="font-heading font-semibold truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.project_type || "—"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {p.client_name && <p className="flex items-center gap-1.5"><User2 className="h-3 w-3"/> {p.client_name}</p>}
                    {p.location && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3"/> {p.location}</p>}
                    <p className="flex items-center gap-1.5"><Calendar className="h-3 w-3"/> {new Date(p.updated_at).toLocaleDateString()}</p>
                  </div>
                </Link>
              ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProjectsPage;
