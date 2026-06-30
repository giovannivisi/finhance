import { CircleCheck } from "lucide-react";
import Container from "@components/Container";

export const metadata = {
  title: "Account deleted | Finhance",
};

export default function AccountDeletedPage() {
  return (
    <Container>
      <section className="account-deleted-page">
        <CircleCheck size={36} aria-hidden="true" />
        <p className="page-kicker">Account closed</p>
        <h1 className="page-title">Your account has been deleted</h1>
        <p className="page-subtitle">
          Your user-owned data has been permanently removed and all sessions
          have ended. You can now close this window.
        </p>
      </section>
    </Container>
  );
}
