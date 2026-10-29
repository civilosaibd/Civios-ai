import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Mail, MessageCircle, Send, ShieldCheck, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const WHATSAPP_NUMBER = "8801832313998";
const SUPPORT_EMAIL = "civilosaibd@gmail.com";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Please enter a valid email address").max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(5, "Message must be at least 5 characters").max(2000),
});

const contactOptions = [
  { icon: MessageCircle, title: "WhatsApp", detail: "+880 1832-313998", action: "Chat with us", href: `https://wa.me/${WHATSAPP_NUMBER}`, external: true },
  { icon: Mail, title: "Email", detail: SUPPORT_EMAIL, action: "Send an email", href: `mailto:${SUPPORT_EMAIL}`, external: false },
  { icon: Clock3, title: "Response time", detail: "We’ll get back to you as soon as possible", action: "", href: "", external: false },
];

const ContactPage = () => {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        subject: parsed.data.subject || null,
        message: parsed.data.message,
      });

      if (error) {
        toast.error("We couldn't save your message. Please try again or contact us on WhatsApp.");
        return;
      }

      const waText = encodeURIComponent(
        `🆕 New Contact Message\n\n👤 ${parsed.data.name}\n✉️ ${parsed.data.email}${parsed.data.phone ? `\n📱 ${parsed.data.phone}` : ""}${parsed.data.subject ? `\n📌 ${parsed.data.subject}` : ""}\n\n💬 ${parsed.data.message}`
      );
      const whatsappWindow = window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`, "_blank", "noopener,noreferrer");
      if (!whatsappWindow) {
        toast.success("Message saved successfully. You can also reach us directly on WhatsApp.");
      } else {
        toast.success("Message saved successfully. WhatsApp is opening in a new tab.");
      }
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch {
      toast.error("Something went wrong while sending your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Contact CivilOS AI"
        description="Contact the CivilOS AI team for help with construction estimation, BOQ workflows, account questions or product feedback."
        path="/contact"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact CivilOS AI",
          url: "https://civilosai.pro.bd/contact",
          mainEntity: { "@type": "Organization", name: "CivilOS AI", email: SUPPORT_EMAIL, url: "https://civilosai.pro.bd/" },
        }}
      />
      <Navbar />
      <main className="flex-1">
        <section className="border-b bg-gradient-to-br from-primary/10 via-background to-accent/10">
          <div className="container max-w-6xl py-12 md:py-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-sm font-medium text-primary">
                <MessageCircle className="h-4 w-4" /> CivilOS AI support
              </div>
              <h1 className="mt-5 font-heading text-4xl font-bold tracking-tight md:text-5xl">
                {t("contact.title") || "Let’s talk about your project"}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                Have a question, found an issue, or have an idea to improve CivilOS AI? Send us a message and tell us how we can help.
              </p>
            </div>
          </div>
        </section>

        <section className="container max-w-6xl py-10 md:py-14">
          <div className="grid items-start gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <aside className="space-y-5">
              <div>
                <h2 className="font-heading text-2xl font-bold">Contact options</h2>
                <p className="mt-2 leading-6 text-muted-foreground">Choose the channel that works best for you.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {contactOptions.map(({ icon: Icon, title, detail, action, href, external }) => {
                  const content = (
                    <div className="flex items-start gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold">{title}</h3>
                        <p className="mt-1 break-words text-sm text-muted-foreground">{detail}</p>
                        {action && <p className="mt-2 inline-flex items-center text-sm font-medium text-primary">{action} <ArrowRight className="ml-1 h-3.5 w-3.5" /></p>}
                      </div>
                    </div>
                  );
                  return href ? (
                    <a key={title} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</a>
                  ) : <div key={title}>{content}</div>;
                })}
              </div>

              <div className="rounded-2xl border bg-muted/40 p-5">
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" /> What to include</div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>• A short description of your question or issue</li>
                  <li>• The page or tool you were using</li>
                  <li>• Any error message you saw (please omit passwords or secret keys)</li>
                </ul>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border p-4">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">Ready to explore first?</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Try the demo estimate to get familiar with the project workflow.</p>
                  <Link to="/estimate/demo" className="mt-2 inline-flex items-center text-sm font-semibold text-primary hover:underline">Open demo estimate <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </div>
              </div>
            </aside>

            <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7 md:p-8">
              <div className="mb-6">
                <h2 className="font-heading text-2xl font-bold">Send us a message</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Fields marked with * are required. Your message is saved so our team can review it.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">Full name *</Label>
                    <Input id="contact-name" autoComplete="name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">Email address *</Label>
                    <Input id="contact-email" type="email" autoComplete="email" required maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-phone">Phone number <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="contact-phone" type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+8801..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-subject">Subject <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="contact-subject" maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="How can we help?" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="contact-message">Your message *</Label>
                    <span className="text-xs text-muted-foreground">{form.message.length}/2000</span>
                  </div>
                  <textarea
                    id="contact-message"
                    className="min-h-36 w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    required minLength={5} maxLength={2000}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us what you need help with..."
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending message…</> : <><Send className="mr-2 h-4 w-4" />Send message</>}
                </Button>
                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Never include passwords, payment secrets, API keys or other sensitive credentials in a support message.
                </p>
              </form>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default ContactPage;
