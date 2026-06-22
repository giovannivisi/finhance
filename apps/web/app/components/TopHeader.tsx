import Link from "next/link";
import Image from "next/image";
import ShellAccountMenu from "@components/ShellAccountMenu";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";

export default async function TopHeader() {
  const hostedAuthMode = isHostedAuthMode();
  const session = hostedAuthMode ? await auth() : null;

  if (hostedAuthMode && !session?.user?.id) {
    return (
      <header className="top-header">
        <Link href="/" prefetch={false} className="top-header-brand">
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
          <Link href="/login" className="btn-secondary top-header-auth-link">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary top-header-auth-link">
            Create account
          </Link>
        </div>
      </header>
    );
  }

  const identity = {
    title: hostedAuthMode
      ? (session?.user?.name ?? session?.user?.email ?? "Hosted workspace")
      : "Local workspace",
    subtitle: hostedAuthMode
      ? (session?.user?.email ?? "Account and app actions")
      : "Private on this device",
  };

  return (
    <header className="top-header">
      <Link href="/" prefetch={false} className="top-header-brand">
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
        <ShellAccountMenu identity={identity} canSignOut={hostedAuthMode} />
      </div>
    </header>
  );
}
