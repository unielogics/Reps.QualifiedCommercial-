// Your account, including two-step verification and your signature on file.
//
// Clerk's profile UI was already reachable from the avatar menu, but only as a
// modal with no address. Mounting it on a path gives the Security tab a real
// URL — /account/security — which matters for three reasons: it can be linked
// from a banner, it can be sent to someone in a message, and it can be
// screenshotted as evidence that the control exists.
//
// Everything inside the Clerk block is Clerk's own component. We are not
// rebuilding enrolment; TOTP secrets and backup codes should be handled by the
// people who own the session, not by us. The signature card above it is ours:
// the one signature a rep adopts for placement on program agreements that
// name them (GET/POST/DELETE /me/signature).

import { UserProfile } from "@clerk/nextjs";
import { SignatureAdoptCard } from "@/components/SignatureAdoptCard";

export default function AccountPage() {
  return (
    <>
      <div className="hd">
        <h2>Your account</h2>
        <p className="lede">
          Password, two-step verification, active devices and your signature on file. Two-step
          verification is required on every Qualified Commercial login.
        </p>
      </div>

      <div className="mt">
        <SignatureAdoptCard />
      </div>

      <div className="mt">
        <UserProfile routing="path" path="/account" />
      </div>
    </>
  );
}
