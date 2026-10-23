import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Link } from "react-router-dom";
import { ShieldCheck, LockKeyhole, Database, FileText, Mail, ArrowRight } from "lucide-react";

const sections = [
  {
    icon: Database,
    title: "Information we collect",
    body: [
      "Account information you provide, such as your name, email address and authentication details needed to create and secure your account.",
      "Project information you choose to enter or upload, which may include drawings, plans, quantities, estimates, site notes, images and documents.",
      "Messages you send to us and basic technical information needed to operate, protect and troubleshoot the service.",
    ],
  },
  {
    icon: LockKeyhole,
    title: "How we use information",
    body: [
      "To provide sign-in, save and display your projects, generate requested calculations or reports, and operate the features you choose to use.",
      "To respond to support requests, maintain service security, diagnose errors and improve reliability.",
      "To comply with applicable legal obligations and prevent abuse or unauthorized access.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Service providers and sharing",
    body: [
      "CivilOS AI uses third-party infrastructure and services to operate features, which may include Supabase for authentication and data services and Google when you choose Google sign-in.",
      "Information may be processed by providers only as needed to deliver, secure or support the service, or disclosed where required by law. We do not publish your private project files as public content by default.",
      "When you use an optional feature that connects to another service or creates a shareable link, review the information and permissions shown before proceeding.",
    ],
  },
  {
    icon: FileText,
    title: "Your drawings and AI-generated results",
    body: [
      "Only upload information you have permission to use. Treat project drawings, site photos and documents as potentially confidential.",
      "AI-generated estimates, quantities, code interpretations, drawings and recommendations may contain errors or omissions. They are aids, not a substitute for review by a qualified professional.",
      "Do not rely on an automated output alone for structural safety, permitting, construction or other high-impact decisions. Verify calculations, assumptions, local codes and site conditions independently.",
    ],
  },
];

const PrivacyPolicyPage = () => (
  <div className="min-h-screen flex flex-col bg-background">
    <SEO
      title="Privacy Policy"
      description="Learn how CivilOS AI collects, uses, protects and handles account information, project files and AI-generated content."
      path="/privacy"
    />
    <Navbar />
    <main className="flex-1">
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container max-w-5xl py-14 md:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" /> Your privacy matters
          </div>
          <h1 className="mt-5 max-w-3xl font-heading text-4xl font-bold tracking-tight md:text-5xl">Privacy Policy</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            This policy explains how CivilOS AI handles information when you use our civil engineering and construction workspace.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">Last updated: October 23, 2026</p>
        </div>
      </section>

      <div className="container grid max-w-5xl gap-8 py-10 md:grid-cols-[minmax(0,1fr)_260px] md:py-14">
        <article className="min-w-0 space-y-8">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
            <h2 className="font-heading text-xl font-semibold">At a glance</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              We use information to provide CivilOS AI, protect accounts and respond to users. We aim to collect only what is reasonably needed for those purposes. This policy applies to the CivilOS AI website and its features.
            </p>
          </div>

          {sections.map((section, index) => {
            const Icon = section.icon;
            return (
              <section key={section.title} id={section.title.toLowerCase().replace(/[^a-z]+/g, "-")} className="scroll-mt-24">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="font-heading text-xl font-semibold md:text-2xl">{index + 1}. {section.title}</h2>
                </div>
                <ul className="space-y-3 pl-1">
                  {section.body.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-7 text-muted-foreground md:text-base">
                      <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">5. Security and retention</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              We use reasonable technical and organizational measures intended to protect information. No internet service can guarantee absolute security. Information may be kept for as long as needed to provide the service, maintain legitimate business records, resolve disputes, meet legal obligations or enforce our agreements. Actual retention may depend on the feature and service provider involved.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">6. Your choices and requests</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Keep your account credentials secure and avoid uploading sensitive information unless necessary. You may contact us to request access, correction or deletion of personal information associated with your account. We may need to verify your identity and retain some information where legally required or necessary for security.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">7. Children and policy changes</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              CivilOS AI is intended for people who can lawfully use the service in their jurisdiction; it is not designed to knowingly collect personal information from children. We may update this policy as the service changes. The revised version will be published on this page with an updated date.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-muted/40 p-5 md:p-7">
            <h2 className="font-heading text-xl font-semibold">8. Contact us</h2>
            <p className="mt-2 leading-7 text-muted-foreground">Questions or privacy requests? Contact the CivilOS AI team.</p>
            <a href="mailto:zobaerhasan431@gmail.com" className="mt-4 inline-flex items-center gap-2 font-medium text-primary hover:underline">
              <Mail className="h-4 w-4" /> zobaerhasan431@gmail.com
            </a>
            <div className="mt-4">
              <Link to="/contact" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                Visit contact page <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </article>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 md:sticky md:top-24">
          <p className="font-heading font-semibold">On this page</p>
          <nav className="mt-4 space-y-3 text-sm text-muted-foreground">
            {["Information we collect", "How we use information", "Service providers and sharing", "Your drawings and AI-generated results"].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="block hover:text-primary">{item}</a>
            ))}
            <a href="#security-and-retention" className="block hover:text-primary">Security and retention</a>
          </nav>
          <div className="mt-6 border-t border-border pt-4">
            <Link to="/terms" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              Read Terms of Service <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </main>
    <Footer />
  </div>
);

export default PrivacyPolicyPage;
