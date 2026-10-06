/**
 * VoicePad Terms of Service & Privacy Policy (in-app copy).
 * Keep in sync with the website pages (voicepadapp.vercel.app/privacy, /terms, /delete-account).
 */

export const LEGAL_LAST_UPDATED = 'October 6, 2026';
/**
 * Bump CONSENT_VERSION whenever the policy changes in a way users must re-accept.
 * v2 (Oct 6, 2026): audio is never stored; only text syncs. Existing users see the consent popup once more.
 */
export const CONSENT_VERSION = 2;
export const CONSENT_STORAGE_KEY = `@voicepad/terms_accepted_v${CONSENT_VERSION}`;
export const LEGAL_CONTACT_EMAIL = 'michaelolaoluwagab@gmail.com';

export interface LegalSection {
  id: string;
  title: string;
  content: string;
  /** When set, the section renders as a tappable link to that document. */
  link?: 'privacy' | 'terms';
}

export const TERMS_OF_SERVICE: {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
} = {
  title: 'Terms of Service',
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    { id: 'agree', title: `1. Agreement`, content: `By using VoicePad (the Android app and voicepadapp.vercel.app) you agree to these terms. If you do not agree, please do not use VoicePad.` },
    { id: 'use', title: `2. Using VoicePad`, content: `You must be at least 13 to use VoicePad. You are responsible for keeping your account secure and for what happens under it.` },
    { id: 'recording', title: `3. Recording other people`, content: `You are responsible for getting permission from people you record and for following the recording laws where you are.` },
    { id: 'acceptable', title: `4. Acceptable use`, content: `Do not use VoicePad to break the law, to harass or harm anyone, or to process content you have no right to use. Do not try to get around usage limits, misuse or overload our servers, or extract our service keys.` },
    { id: 'ai', title: `5. AI results`, content: `Transcripts, summaries and scanned text are created automatically and may contain mistakes. Check anything important. Do not rely on VoicePad for medical, legal, emergency or other critical records. We give no warranty that results are accurate or complete.` },
    { id: 'content', title: `6. Your content`, content: `You own your recordings, notes and transcripts. You give us permission to process them, and to store your notes and transcripts (text only, never audio), only to provide VoicePad's features to you.` },
    { id: 'ads', title: `7. Ads and free use`, content: `VoicePad is free and supported by ads. We may change free usage limits or features over time.` },
    { id: 'privacy', title: `8. Privacy`, content: `How we handle your data is explained in our Privacy Policy.`, link: 'privacy' },
    { id: 'termination', title: `9. Ending your account`, content: `You can stop using VoicePad and delete your account at any time from Profile → Delete Account & Data. We may suspend or close accounts that break these terms or abuse the service.` },
    { id: 'liability', title: `10. Disclaimer and limitation of liability`, content: `VoicePad is provided "as is", without warranties of any kind. To the extent the law allows, we are not liable for indirect or consequential losses, or for lost data. Our total liability to you is limited to the amount you paid us in the 12 months before the claim.` },
    { id: 'changes', title: `11. Changes to these terms`, content: `We may update these terms. We will change the effective date above, and continuing to use VoicePad means you accept the new terms.` },
    { id: 'law', title: `12. Governing law`, content: `These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have jurisdiction.` },
    { id: 'contact', title: `13. Contact`, content: `Questions: michaelolaoluwagab@gmail.com.` },
  ],
};

export const PRIVACY_POLICY: {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
} = {
  title: 'Privacy Policy',
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    { id: 'who', title: `1. Who we are`, content: `VoicePad is a voice-notes app made by Olaoluwa Michael ("we", "us"). This policy covers the VoicePad Android app and the website voicepadapp.vercel.app. Contact: michaelolaoluwagab@gmail.com.` },
    { id: 'mic', title: `2. Microphone`, content: `VoicePad uses your microphone only while you are recording. You start and stop every recording yourself. If you allow notifications, a recording you started can continue while your screen is locked, and a notification shows while it does.` },
    { id: 'ai', title: `3. Transcription and summaries`, content: `Your audio is processed only to create your transcript. VoicePad never stores your audio on our servers or in our cloud.

When you transcribe a recording, the audio is sent over an encrypted (HTTPS) connection to our server, which passes it to third-party speech and AI providers (Groq, Deepgram and Google Gemini) to create the transcript. Our server holds the audio only while your request is processed and deletes it straight after. It does not log audio or transcripts. The finished text result is held in the server's memory for up to 10 minutes, so a retried request is not processed twice, and is then discarded. Transcript text is sent the same way when you ask for a summary.

On the website, your browser may send audio directly to Deepgram using a short-lived key, or through our server in the same way. The providers process this data only to return the result, under their own privacy terms.` },
    { id: 'scan', title: `4. Photo scan (text from images)`, content: `When you scan or pick a photo to turn into text, the image is sent over HTTPS to our server and passed to Google Gemini or Groq to read the text. Our server deletes the image straight after.` },
    { id: 'storage', title: `5. Where your notes are stored`, content: `Your recordings stay on your device. They are never uploaded to our cloud, even when you are signed in.

Your notes, transcripts and summaries are stored on your device. If you sign in, only this text (with details like the title, category, date and length of a recording) is also backed up to your private account in our cloud database (Supabase), so you can restore it on another device. Only your account can access it. If you do not sign in, nothing is stored on our servers.

Because audio is not synced, a recording can only be played on the phone that made it.` },
    { id: 'account', title: `6. Account data`, content: `If you create an account we store your email address, your name, and your password in hashed form (we never see it). If you use Continue with Google, Google shares your name, email address and profile picture with us.` },
    { id: 'ads', title: `7. Ads`, content: `VoicePad is free and shows banner ads from Google AdMob after you accept these terms. AdMob may collect your device's advertising ID, IP address, approximate location and how you interact with ads, to show, personalise and measure them. See how Google uses this data: https://policies.google.com/technologies/partner-sites

To opt out of personalised ads or reset your advertising ID on Android, open Settings → Google → Ads (on some phones, Settings → Privacy → Ads) and choose Delete advertising ID or Reset advertising ID.` },
    { id: 'tech', title: `8. Technical data`, content: `To keep free usage fair and stop abuse, our server uses your IP address or account ID in memory to count requests over a rolling 24 hours. Our hosting providers (Render and Vercel) may keep standard technical logs, such as IP address and request time, for security.` },
    { id: 'share', title: `9. Sharing`, content: `We do not sell your personal data. We share it only with the service providers named in this policy, so they can provide their part of VoicePad, or when the law requires it. We do not use your recordings or notes to train AI models.` },
    { id: 'retention', title: `10. Keeping and deleting your data`, content: `Data on your device stays until you delete the note or uninstall the app. Cloud text data is kept while your account exists.

To delete your account and your synced notes from our servers, tap Profile → Delete Account & Data in the app. It happens straight away, and it also removes any recordings that versions of VoicePad before 1.1.3 backed up. You can also email us from your account email and we will delete it within 7 days. Copies in our providers' routine backups are removed in their normal backup cycle. Details: https://voicepadapp.vercel.app/delete-account` },
    { id: 'security', title: `11. Security`, content: `All data travels over HTTPS. Your cloud data is locked to your account, and our service keys stay on our server, never in the app. No system is perfectly secure, but we work to protect your data.` },
    { id: 'children', title: `12. Children`, content: `VoicePad is not directed at children under 13, and we do not knowingly collect their data. If you believe a child has given us data, email us and we will delete it.` },
    { id: 'rights', title: `13. Your rights`, content: `Under the Nigeria Data Protection Act 2023 you can ask to access, correct or delete your personal data, object to or restrict how we use it, get a copy of it, and withdraw consent. You can also complain to the Nigeria Data Protection Commission (NDPC).

If you live elsewhere, for example in the EU or UK, you have similar rights under laws like the GDPR. To use any of these rights, email michaelolaoluwagab@gmail.com. We reply within 30 days.` },
    { id: 'changes', title: `14. Changes to this policy`, content: `If we change this policy, we will update the effective date above. For important changes we will also tell you in the app.` },
    { id: 'contact', title: `15. Contact`, content: `Questions or requests: michaelolaoluwagab@gmail.com.` },
  ],
};
