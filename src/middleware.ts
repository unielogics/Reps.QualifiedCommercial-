import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Deny by default. Staff screens stay behind Clerk; tokenized booking and
// contact-card pages are public because recipients arrive from email/SMS links.
const isPublic = createRouteMatcher(["/sign-in(.*)", "/book(.*)", "/card(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
});

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)", "/(api|trpc)(.*)"],
};
