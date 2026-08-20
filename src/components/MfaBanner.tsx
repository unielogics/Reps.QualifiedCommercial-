"use client";

// Tells you when your account has no second factor.
//
// Clerk requires two-step verification at sign-in, but "required" only bites at
// the moment someone signs in. Anyone already holding a session keeps working
// with a single factor until it next expires, and nothing in the product says
// so. This is the thing that says so.
//
// Reads Clerk directly rather than our own API, because Clerk is the system of
// record for the second factor and a copy in our database would go stale the
// moment someone enrols.

import Link from "next/link";
import { useUser } from "@clerk/nextjs";

export default function MfaBanner() {
  const { isLoaded, user } = useUser();

  // Never render on an unresolved session. Flashing "you are not protected" at
  // someone who is protected teaches them to ignore the banner.
  if (!isLoaded || !user) return null;

  // A passkey satisfies the second-factor requirement on this Clerk instance
  // (passkey_settings.satisfies_second_factor), so someone who has one is done
  // and must not be nagged.
  const hasSecondFactor = user.twoFactorEnabled || (user.passkeys?.length ?? 0) > 0;
  if (hasSecondFactor) return null;

  return (
    <div className="note" style={{ marginTop: 0, marginBottom: 14 }}>
      <div>
        <b>Two-step verification is not set up on this account.</b>
        <div className="sub" style={{ marginTop: 2 }}>
          It takes about a minute with an authenticator app, and it is required for
          everyone with access to client files.{" "}
          <Link href="/account/security" style={{ color: "var(--accent)" }}>
            Set it up now
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
