/**
 * Expo config plugin: lets VoicePad receive audio from the Android Share sheet
 * (WhatsApp: long-press a voice note → Share → VoicePad).
 *
 * The android/ folder is hand-maintained (gitignored) and already contains these
 * changes; this plugin re-applies them if `expo prebuild` ever regenerates it:
 *  1. SEND / SEND_MULTIPLE intent-filters (audio/*, application/ogg) on MainActivity.
 *  2. MainActivity code that copies the shared stream into the cache and rewrites
 *     the intent to voicepad://share?file=… (cold start + onNewIntent).
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const MIME_TYPES = ['audio/*', 'application/ogg'];
const ACTIONS = ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE'];
const IMPORTS = [
  'android.content.Intent',
  'android.net.Uri',
  'android.provider.OpenableColumns',
  'android.util.Log',
  'java.io.File',
  'java.io.FileOutputStream',
];

function withShareManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const activity = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!activity) return cfg;
    activity['intent-filter'] = activity['intent-filter'] || [];
    for (const action of ACTIONS) {
      const exists = activity['intent-filter'].some((f) =>
        (f.action || []).some((a) => a.$['android:name'] === action)
      );
      if (exists) continue;
      activity['intent-filter'].push({
        $: { 'android:label': 'VoicePad' },
        action: [{ $: { 'android:name': action } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: MIME_TYPES.map((mimeType) => ({ $: { 'android:mimeType': mimeType } })),
      });
    }
    return cfg;
  });
}

function withShareActivity(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') return cfg;
    cfg.modResults.contents = applyShareActivity(cfg.modResults.contents);
    return cfg;
  });
}

function applyShareActivity(src) {
    if (src.includes('@voicepad-share begin')) return src;
    const block = fs.readFileSync(path.join(__dirname, 'share-intent-activity.kt.txt'), 'utf8');
    for (const imp of IMPORTS) {
      if (!src.includes(`import ${imp}\n`)) {
        src = src.replace(/(package [^\n]+\n)/, `$1import ${imp}\n`);
      }
    }
    src = src.replace(
      /(\n\s*)super\.onCreate\((null|savedInstanceState)\)/,
      '$1rewriteShareIntent(intent)?.let { setIntent(it) }$1super.onCreate($2)'
    );
    const lastBrace = src.lastIndexOf('}');
    src = src.slice(0, lastBrace) + '\n' + block + '}\n';
    return src;
}

module.exports = function withShareIntent(config) {
  return withShareActivity(withShareManifest(config));
};
module.exports.applyShareActivity = applyShareActivity;
