import Link from "next/link";
import Image from "next/image";
import ShellAccountMenu from "@components/ShellAccountMenu";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";

export default async function TopHeader() {
  const session = isHostedAuthMode() ? await auth() : null;
  const identity = session?.user
    ? {
        title:
          session.user.name?.trim() ||
          session.user.email?.trim() ||
          "Account",
        subtitle: session.user.email?.trim() || "Hosted workspace",
      }
    : {
        title: isHostedAuthMode() ? "Hosted workspace" : "Local workspace",
        subtitle:
          isHostedAuthMode()
            ? "Account and app actions"
            : "Private on this device",
      };

  return (
    <header className="top-header">
      <Link href="/" className="top-header-brand">
        <Image
          src="/logo-dark.svg"
          alt="finhance logo dark"
          width={44}
          height={44}
          loading="eager"
          style={{ objectFit: "contain" }}
          className="theme-logo-dark"
        />
        <Image
          src="/logo-light.svg"
          alt="finhance logo light"
          width={44}
          height={44}
          loading="eager"
          style={{ objectFit: "contain" }}
          className="theme-logo-light"
        />
        <span className="top-header-wordmark">finhance</span>
      </Link>
      <div className="top-header-actions">
        <ShellAccountMenu identity={identity} />
      </div>
    </header>
  );
}
