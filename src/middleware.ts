import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Deny by default. The only unauthenticated page is sign-in; every client-facing
// token room lives on audit.qualifiedcommercial.com, not here, because this app
// is for staff only.
const isPublic = createRouteMatcher(["/sign-in(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
});

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)", "/(api|trpc)(.*)"],
};
