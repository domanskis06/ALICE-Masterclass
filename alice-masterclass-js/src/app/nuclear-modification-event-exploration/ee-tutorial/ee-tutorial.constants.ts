/**
 * Tour step indices that wait for a student action before auto advancing.
 * Shifted by one when the magnet-off demonstration step was inserted before
 * the picking challenge — keep in step with `buildSteps`.
 */
export const NMF_EE_STEP_PICK_PRIMARIES = 7;
export const NMF_EE_STEP_GO_NEXT_EVENT = 8;
export const NMF_EE_STEP_SUBMIT_FILTER = 11;
export const NMF_EE_STEP_MARQUEE = 13;

/**
 * Highlight the WebGL scene only — not the whole event-display wrap
 * (left sidebar + scene), which made the driver.js cutout look huge.
 */
export const NMF_TOUR_3D_SELECTOR = '.nmf-event-display-wrap .scene-area';
