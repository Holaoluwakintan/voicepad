# Google Ads and SEO implementation

## Advertising architecture

VoicePad now has separate integrations for the two Google advertising products:

- **Web:** Google AdSense responsive display inventory, loaded only after the visitor chooses “Allow ads” and only when `VITE_ADSENSE_CLIENT` is configured.
- **Native iOS/Android:** Google Mobile Ads / AdMob anchored adaptive banner on the native Home screen. It is hidden on web and until the existing VoicePad terms/privacy consent has been accepted.

No publisher IDs were invented or committed. Until real IDs are provided, the web slot is not rendered in production and native development uses Google’s test banner ID. This prevents accidental invalid traffic and keeps local builds safe.

## One-time Google setup

1. Create or select the VoicePad website in AdSense and copy the `ca-pub-*` publisher client ID.
2. Create Android and iOS apps in AdMob and copy each `ca-app-pub-*~*` app ID.
3. Create a banner ad unit in AdMob and copy its `ca-app-pub-*/*` unit ID.
4. Complete Google’s site review, `ads.txt` requirements, and privacy/consent configuration before requesting production traffic.
5. In Google Play Console, declare that the app contains ads. For iOS, review App Tracking Transparency and Google’s User Messaging Platform requirements for the regions served.

## Environment configuration

Copy `.env.ads-seo.example` into the appropriate deployment secret/environment configuration:

```text
VITE_ADSENSE_CLIENT=ca-pub-your-publisher-id
VITE_ADSENSE_SLOT=your-display-unit-id
ADMOB_ANDROID_APP_ID=ca-app-pub-your-android-app-id
ADMOB_IOS_APP_ID=ca-app-pub-your-ios-app-id
EXPO_PUBLIC_ADMOB_BANNER_ID=ca-app-pub-your-banner-unit-id
VITE_SITE_URL=https://your-canonical-domain.example
```

For native builds, both AdMob app IDs must be present when Expo evaluates `app.config.js`; otherwise the native ads plugin is intentionally omitted. Rebuild the binary after adding or changing IDs. Do not use production IDs while developing; keep Google test ads enabled in development.

## SEO foundation

The web shell now includes a descriptive title, meta description, canonical URL, robots directives, Open Graph/Twitter cards, WebSite/Organization/SoftwareApplication/FAQPage JSON-LD, a web manifest, `robots.txt`, and an XML sitemap. The sitemap lists only public pages and points crawlers to the canonical domain.

Before launch, replace `https://voicepad.app` in `web/client/index.html`, `web/client/public/robots.txt`, and `web/client/public/sitemap.xml` with the verified production origin if different. Submit `/sitemap.xml` in Google Search Console and validate JSON-LD with Google’s Rich Results Test.

For premium ongoing SEO, the next content layer should be server-rendered or prerendered public pages for intent-based topics such as “voice notes to text,” “meeting transcription,” “private voice memo app,” and “photo to text notes.” Each page should have unique, useful copy, a single canonical URL, internal links, and evidence-based product claims—not thin AI-generated pages.

## Sources consulted

- [Google AdSense ad tags](https://developers.google.com/adsense/platforms/transparent/ad-tags)
- [Google Search structured data guidance](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google Search sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [React Native Google Mobile Ads / Expo guidance](https://docs.page/invertase/react-native-google-mobile-ads)
