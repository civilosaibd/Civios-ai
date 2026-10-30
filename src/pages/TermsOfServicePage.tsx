import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Link } from "react-router-dom";
import { Scale, HardHat, ShieldAlert, CreditCard, Mail, ArrowRight } from "lucide-react";

const TermsOfServicePage = () => (
  <div className="min-h-screen flex flex-col bg-background">
    <SEO
      title="Terms of Service"
      description="Read the terms for using CivilOS AI tools, project workspace, estimates, AI outputs and related services."
      path="/terms"
    />
    <Navbar />
    <main className="flex-1">
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container max-w-5xl py-14 md:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-sm font-medium text-primary">
            <Scale className="h-4 w-4" /> Clear terms, responsible use
          </div>
          <h1 className="mt-5 max-w-3xl font-heading text-4xl font-bold tracking-tight md:text-5xl">Terms of Service</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            These terms describe the basic rules for accessing and using CivilOS AI.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">Last updated: October 23, 2026</p>
        </div>
      </section>

      <div className="container max-w-5xl py-10 md:py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: HardHat, title: "Professional review", text: "Verify engineering outputs before using them in real projects." },
            { icon: ShieldAlert, title: "Use responsibly", text: "Protect your account and upload only content you may lawfully use." },
            { icon: Scale, title: "Fair access", text: "Do not abuse, disrupt or attempt to compromise the service." },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <h2 className="mt-4 font-heading text-lg font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </div>
            );
          })}
        </div>

        <article className="mt-10 space-y-8">
          <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 md:p-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Zobaerio Technologies</p>
              <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight md:text-3xl">Our Vision &amp; Mission</h2>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/80 p-5">
                  <h3 className="font-heading text-lg font-semibold">Our Vision</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">To become a globally recognized technology and engineering company by developing innovative AI-powered solutions that transform industries and improve everyday life.</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 p-5">
                  <h3 className="font-heading text-lg font-semibold">Our Mission</h3>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                    {[
                      "Develop advanced AI technologies.",
                      "Transform civil engineering through automation.",
                      "Build professional software solutions.",
                      "Deliver innovative engineering services.",
                      "Expand technology access globally.",
                      "Create employment opportunities.",
                    ].map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{item}</span></li>)}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">1. Accepting these terms</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              By accessing or using CivilOS AI, you agree to these Terms of Service and the <Link to="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>. If you do not agree, do not use the service. If you use CivilOS AI on behalf of an organization, you confirm that you are authorized to accept these terms for that organization.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">2. Accounts and account security</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              You must provide information that is accurate to the best of your knowledge and keep your sign-in credentials secure. You are responsible for activity carried out through your account, except where applicable law provides otherwise. Tell us promptly if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">3. Acceptable use</h2>
            <p className="mt-3 leading-7 text-muted-foreground">You agree not to:</p>
            <ul className="mt-3 space-y-2 pl-1">
              {[
                "Use the service for unlawful, deceptive, harmful or infringing activity.",
                "Upload content you do not own or have permission to use, or content that violates another person's rights.",
                "Attempt to bypass access controls, probe for vulnerabilities without authorization, disrupt the service or access another user's data.",
                "Interfere with the service, abuse automated features, or misrepresent AI-generated outputs as certified professional approval.",
              ].map((item) => <li key={item} className="flex gap-3 text-sm leading-7 text-muted-foreground md:text-base"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span>{item}</span></li>)}
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">4. Your content</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              You retain rights you hold in drawings, documents, images and other material you submit. You give CivilOS AI permission to process and display that content as reasonably necessary to provide the features you request, protect the service and support your account. You are responsible for having the necessary rights and permissions for submitted material. Do not upload confidential client or employer information unless you are authorized to do so.
            </p>
          </section>

          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 md:p-7">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2 className="font-heading text-xl font-semibold md:text-2xl">5. Engineering and AI disclaimer</h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  CivilOS AI provides software tools and informational outputs. AI-generated calculations, quantities, cost estimates, drawings, code references and recommendations can be incomplete, outdated or incorrect and may not reflect actual site conditions or local requirements. Outputs are not a substitute for professional engineering judgment, site investigation, independent checking, permits or approval by the relevant authorities.
                </p>
                <p className="mt-3 leading-7 text-muted-foreground">
                  You must have a suitably qualified professional verify all safety-critical calculations, structural designs, construction documents, quantities, prices and code compliance before relying on them. You remain responsible for decisions and work performed using the service.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">6. Availability, changes and third-party services</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              We may add, change, suspend or discontinue features as the service develops, and we do not promise uninterrupted or error-free availability. Some features may depend on third-party providers and their own terms, availability and privacy practices. We will make reasonable efforts to communicate material changes where appropriate.
            </p>
          </section>

          <section>
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-xl font-semibold md:text-2xl">7. Plans, fees and billing</h2>
            </div>
            <p className="mt-3 leading-7 text-muted-foreground">
              If a feature or plan has a fee, the price and applicable billing terms should be shown before you commit to purchase. You are responsible for charges you authorize. Any refund, renewal or cancellation conditions presented during checkout or in a plan description also apply. Do not assume a paid feature is included in a free plan unless the product says so.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">8. Intellectual property</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              CivilOS AI's service, branding, software and associated materials are protected by applicable intellectual property laws. Except for rights expressly granted to you or required by law, these terms do not transfer ownership of the service to you.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">9. Suspension and termination</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              We may restrict or suspend access where reasonably necessary to protect users, investigate suspected abuse, comply with law or enforce these terms. You may stop using the service at any time. Contact us for help with account-related requests.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">10. Warranties and liability</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              To the extent permitted by applicable law, the service is provided on an “as available” basis without a guarantee that every feature or output will be accurate, uninterrupted or suitable for a particular purpose. Nothing in these terms excludes rights or liability that cannot legally be excluded. To the extent permitted by law, CivilOS AI is not responsible for indirect or consequential losses arising from use of, or inability to use, the service.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold md:text-2xl">11. Changes to these terms</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              We may update these terms as the product or applicable requirements change. The updated version will be posted on this page with a revised date. Continued use after an update takes effect means you accept the revised terms, to the extent permitted by law.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-muted/40 p-5 md:p-7">
            <h2 className="font-heading text-xl font-semibold">12. Contact</h2>
            <p className="mt-2 leading-7 text-muted-foreground">Questions about these terms? Contact the CivilOS AI team.</p>
            <a href="mailto:zobaerhasan431@gmail.com" className="mt-4 inline-flex items-center gap-2 font-medium text-primary hover:underline">
              <Mail className="h-4 w-4" /> zobaerhasan431@gmail.com
            </a>
            <div className="mt-4">
              <Link to="/contact" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                Contact page <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </article>
      </div>
    </main>
    <Footer />
  </div>
);

export default TermsOfServicePage;
