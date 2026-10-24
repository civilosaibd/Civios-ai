import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  /** Accepts a route path (e.g. "/about") or an absolute URL. Canonicals always use the primary domain. */
  url?: string;
  type?: string;
  path?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const SITE = "https://civilosai.pro.bd";
const BRAND = "CivilOS AI";
const DEFAULT_TITLE = "CivilOS AI — AI Construction Estimation & Civil Engineering Tools";
const DEFAULT_DESC =
  "AI-powered construction cost estimation for Bangladesh. Create BOQ, analyze PWD rates, explore BNBC guidance and manage civil engineering projects with CivilOS AI.";

// Only genuine public marketing, company and legal pages should be indexed.
// Workspace tools, account pages, private projects and user-generated shares are not SEO landing pages.
const INDEXABLE_PATHS = new Set(["/", "/upload", "/about", "/contact", "/privacy", "/terms", "/sponsor"]);

const SEO = ({ title, description, image, url, path, type = "website", noindex, jsonLd }: SEOProps) => {
  const fullTitle = title ? `${title} | ${BRAND}` : DEFAULT_TITLE;
  const desc = (description || DEFAULT_DESC).replace(/\s+/g, " ").trim().slice(0, 160);
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
  const requestedPath = path ?? url ?? currentPath;
  let pathname = "/";
  try {
    pathname = new URL(requestedPath, SITE).pathname.replace(/\/{2,}/g, "/");
  } catch {
    pathname = currentPath;
  }
  if (pathname.length > 1) pathname = pathname.replace(/\/$/, "");
  const canonical = `${SITE}${pathname === "/" ? "/" : pathname}`;
  const shouldIndex = !noindex && INDEXABLE_PATHS.has(pathname);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta name="robots" content={shouldIndex ? "index, follow, max-image-preview:large, max-snippet:-1" : "noindex, nofollow"} />
      <meta name="googlebot" content={shouldIndex ? "index, follow, max-image-preview:large, max-snippet:-1" : "noindex, nofollow"} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={BRAND} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={canonical} />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      {image && <meta name="twitter:image" content={image} />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
};

export default SEO;
