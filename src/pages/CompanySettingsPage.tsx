import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, Save, TriangleAlert } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type CompanyForm = {
  company_name: string;
  registration_number: string;
  tax_number: string;
  contact_email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  country: string;
};

const EMPTY: CompanyForm = {
  company_name: "", registration_number: "", tax_number: "", contact_email: "",
  phone: "", website: "", address: "", city: "", country: "Bangladesh",
};

export default function CompanySettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<CompanyForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      const { data, error } = await (supabase as any)
        .from("company_settings")
        .select("company_name,registration_number,tax_number,contact_email,phone,website,address,city,country")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setLoadError("Company settings could not be loaded. The database migration may not be deployed yet.");
      } else if (data) {
        setForm({ ...EMPTY, ...data });
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const set = (key: keyof CompanyForm, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    if (!form.company_name.trim()) {
      toast.error("Please enter your company or business name.");
      return;
    }
    if (form.website.trim()) {
      try {
        const parsed = new URL(/^https?:\/\//i.test(form.website.trim()) ? form.website.trim() : `https://${form.website.trim()}`);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid URL");
      } catch {
        toast.error("Enter a valid website, such as https://example.com.");
        return;
      }
    }
    setSaving(true);
    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim() || null])
    );
    const { error } = await (supabase as any).from("company_settings").upsert(
      { ...payload, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) {
      toast.error("Could not save company settings. Check that the database migration is deployed.");
    } else {
      toast.success("Company settings saved.");
    }
  };

  const field = (key: keyof CompanyForm, label: string, placeholder = "", type = "text") => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type={type} value={form[key]} placeholder={placeholder}
        onChange={event => set(key, event.target.value)} maxLength={key === "address" ? 500 : 160} />
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SEO title="Company Settings — CivilOS AI" description="Manage your construction company details for CivilOS AI project workflows." />
      <Navbar />
      <main className="flex-1 py-8 md:py-10">
        <div className="container max-w-4xl space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3"><Building2 className="h-6 w-6 text-primary" /></div>
            <div><h1 className="font-heading text-2xl font-bold md:text-3xl">Company Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">Keep your company details ready for project records and future document workflows.</p></div>
          </div>
          {loadError && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><TriangleAlert className="h-5 w-5 shrink-0" />{loadError}</div>}
          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading company settings" /></div> : (
            <form onSubmit={save} className="space-y-5">
              <Card><CardHeader><CardTitle>Business identity</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
                {field("company_name", "Company / Business Name", "e.g. Hasan Construction", "text")}
                {field("registration_number", "Registration Number", "Company or trade licence number")}
                {field("tax_number", "Tax / VAT / TIN Number", "Optional")}
              </CardContent></Card>
              <Card><CardHeader><CardTitle>Contact information</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
                {field("contact_email", "Business Email", "office@example.com", "email")}
                {field("phone", "Phone Number", "+880 1XXXXXXXXX", "tel")}
                {field("website", "Website", "https://example.com", "url")}
              </CardContent></Card>
              <Card><CardHeader><CardTitle>Business address</CardTitle></CardHeader><CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="address">Street / Full Address</Label><Textarea id="address" value={form.address} maxLength={500} rows={3} placeholder="Building, road, area, post office" onChange={e => set("address", e.target.value)} /></div>
                <div className="grid gap-4 md:grid-cols-2">{field("city", "City / District", "e.g. Satkhira")}{field("country", "Country", "Bangladesh")}</div>
              </CardContent></Card>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setForm(EMPTY)} disabled={saving}>Reset form</Button>
                <Button type="submit" disabled={saving || !user}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save company settings"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">These details are private to your account. Only enter information you are authorized to store. Saving these details does not automatically add them to existing documents.</p>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
