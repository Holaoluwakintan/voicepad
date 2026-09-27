import { useEffect } from "react";
import Home from "./pages/Home";

export default function App() {
  useEffect(() => {
    const siteUrl = String(import.meta.env.VITE_SITE_URL || "").trim().replace(/\/$/, "");
    if (!siteUrl) return;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${siteUrl}/`;
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", `${siteUrl}/`);
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.setAttribute("content", `${siteUrl}/og-image.png`);
    document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.setAttribute("content", `${siteUrl}/og-image.png`);
  }, []);
  return <Home />;
}
