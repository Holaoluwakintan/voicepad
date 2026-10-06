export async function initAdMob(): Promise<void> {}
export function isAdPrivacyOptionsRequired(): boolean { return false; }
export async function showAdPrivacyOptions(): Promise<void> {}
export function whenAdsAllowed(): Promise<boolean> { return Promise.resolve(false); }
