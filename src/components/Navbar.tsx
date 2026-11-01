import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Globe, LogOut, User, LayoutDashboard, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import LiveUsers from "@/components/LiveUsers";
import AnimatedLogo from "@/components/AnimatedLogo";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/upload", label: t("nav.upload") },
    { href: "/estimate/demo", label: t("nav.demo") },
    { href: "/about", label: t("nav.about") },
    { href: "/contact", label: t("nav.contact") },
    { href: "/affiliate-program", label: "Affiliate" },
  ];

  const toggleLang = () => setLang(lang === "en" ? "bn" : "en");

  return (
    <>
    <nav className="sticky top-0 z-50 glass border-b">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" aria-label="CivilOS AI home" className="flex items-center">
          <AnimatedLogo size={48} mode="loop" /><span className="hidden sm:inline-flex flex-col leading-none"><span className="font-heading text-lg font-extrabold tracking-tight text-foreground">CivilOS <span className="text-gradient-primary">AI</span></span></span>
        </Link>
        <div className="hidden lg:flex"><LiveUsers compact /></div>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === l.href
                  ? "text-accent font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={toggleLang} className="gap-1.5">
            <Globe className="h-4 w-4" />
            {lang === "en" ? "বাংলা" : "English"}
          </Button>
          {user ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard"><LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <User className="h-4 w-4" /> Profile
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => navigate("/profile")}>
                    <User className="h-4 w-4 mr-2" /> Profile settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate("/affiliate")}>
                    <Users className="h-4 w-4 mr-2" /> Referrals
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">{t("nav.login")}</Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link to="/upload">{t("nav.getEstimate")}</Link>
          </Button>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={toggleLang}>
            <Globe className="h-4 w-4" />
          </Button>
          <button onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
    </nav>

    {open && (
      <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-[60] bg-background flex flex-col p-6 gap-2 overflow-y-auto animate-in fade-in slide-in-from-top-2">
        {links.map((l) => (
          <Link
            key={l.href}
            to={l.href}
            onClick={() => setOpen(false)}
            className="block px-4 py-3 rounded-lg text-base font-medium text-foreground hover:bg-muted"
          >
            {l.label}
          </Link>
        ))}
        {user && (
          <>
            <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-lg text-base font-medium text-foreground hover:bg-muted">
              Dashboard
            </Link>
            <Link to="/projects" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-lg text-base font-medium text-foreground hover:bg-muted">
              My Projects
            </Link>
            <Link to="/settings/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-lg text-base font-medium text-foreground hover:bg-muted">
              Notification Settings
            </Link>
            <div className="rounded-lg border border-border/60 p-2">
              <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted">
                <User className="h-4 w-4" /> Profile
              </Link>
              <Link to="/affiliate" onClick={() => setOpen(false)} className="flex items-center gap-2 px-6 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                <Users className="h-4 w-4" /> Referrals
              </Link>
              <button onClick={() => { handleSignOut(); setOpen(false); }} className="flex w-full items-center gap-2 px-6 py-2 rounded-md text-sm text-destructive hover:bg-muted">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        )}
        <div className="mt-auto pt-4 flex flex-col gap-2">
          {!user && (
            <Button variant="outline" size="lg" className="w-full" asChild>
              <Link to="/auth" onClick={() => setOpen(false)}>{t("nav.login")}</Link>
            </Button>
          )}
          <Button size="lg" className="w-full" asChild>
            <Link to="/upload" onClick={() => setOpen(false)}>{t("nav.getEstimate")}</Link>
          </Button>
        </div>
      </div>
    )}
    </>
  );
};

export default Navbar;
