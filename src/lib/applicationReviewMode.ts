/**
 * Temporary workflow-review release switch.
 *
 * While enabled, authenticated super admins can open every application step
 * without first satisfying the normal progression gates. Server-side action
 * validation remains active, and Step 5 remains restricted to super admins.
 * Set this to false after the live workflow review is complete.
 */
export const APPLICATION_STEP_REVIEW_MODE = true;
