import Link from "next/link";
import Image from "next/image";
import ShellAccountMenu from "@components/ShellAccountMenu";
import { isHostedAuthMode } from "@lib/auth-mode";

export default function TopHeader() {
  const hostedAuthMode = isHostedAuthMode();
  const identity = {
    title: hostedAuthMode ? "Hosted workspace" : "Local workspace",
    subtitle: hostedAuthMode
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
