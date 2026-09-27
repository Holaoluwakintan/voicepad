import { useEffect, useState } from "react";

const CONSENT_KEY = "voicepad_ads_consent_v1";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSenseSlotProps = {
  slot?: string;
  label?: string;
};

function useAdConsent() {
  const [consent, setConsent] = useState<"unknown" | "accepted" | "declined">("unknown");

  useEffect(() => {
    const saved = window.localStorage.getItem(CONSENT_KEY);
    if (saved === "accepted" || saved === "declined") setConsent(saved);
  }, []);

  const choose = (value: "accepted" | "declined") => {
    window.localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
  };

  return { consent, choose };
}

export function AdConsentNotice({ onChoose }: { onChoose: (value: "accepted" | "declined") => void }) {
  return (
    <div className="ad-consent" role="region" aria-label="Advertising preferences">
      <p>VoicePad uses privacy-conscious advertising to help fund the free beta.</p>
      <div className="ad-consent-actions">
        <button type="button" onClick={() => onChoose("accepted")}>Allow ads</button>
        <button type="button" className="ad-consent-secondary" onClick={() => onChoose("declined")}>No thanks</button>
      </div>
    </div>
  );
}

export default function AdSenseSlot({ slot, label = "Advertisement" }: AdSenseSlotProps) {
  const { consent, choose } = useAdConsent();
  const client = String(import.meta.env.VITE_ADSENSE_CLIENT || "").trim();
  const host = String(import.meta.env.VITE_ADSENSE_HOST || "").trim();

  useEffect(() => {
    if (consent !== "accepted" || !client) return;
    const scriptId = "voicepad-adsense-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}${host ? `&host=${encodeURIComponent(host)}` : ""}`;
      document.head.appendChild(script);
    }
  }, [client, consent, host]);

  useEffect(() => {
    if (consent !== "accepted" || !client) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blockers and consent tooling may prevent an ad request; the page remains usable.
    }
  }, [client, consent]);

  if (!client || consent === "declined") return null;
  if (consent !== "accepted") return <AdConsentNotice onChoose={choose} />;

  return (
    <aside className="ad-slot" aria-label={label}>
      <span className="ad-slot-label">Sponsored</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: 90 }}
        data-ad-client={client}
        {...(host ? { "data-ad-host": host } : {})}
        {...(slot ? { "data-ad-slot": slot } : {})}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
