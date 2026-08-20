import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
      <SignIn forceRedirectUrl="/" />
    </main>
  );
}
