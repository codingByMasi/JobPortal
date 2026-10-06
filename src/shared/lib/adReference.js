// A short code for an ad (written in payment notes and WhatsApp messages) so money and requests can be matched to the ad.

/** "AD-1A2B3C4D": the first 8 letters/digits of the ad id. */
export const adReference = (jobId) => `AD-${String(jobId).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
