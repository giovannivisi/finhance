import Link from "next/link";
import Image from "next/image";

export default function TopHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "24px 48px",
        borderBottom: "1px solid var(--border-glass)",
        background: "var(--bg-header)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <Link
        href="/"
        style={{ display: "flex", alignItems: "center", gap: "16px" }}
      >
        <Image
          src="/logo-dark.svg"
          alt="finhance logo dark"
          width={44}
          height={44}
          style={{ objectFit: "contain" }}
          className="theme-logo-dark"
        />
        <Image
          src="/logo-light.svg"
          alt="finhance logo light"
          width={44}
          height={44}
          style={{ objectFit: "contain" }}
          className="theme-logo-light"
        />
        <span
          style={{
            fontSize: "30px",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.04em",
          }}
        >
          finhance
        </span>
      </Link>
    </header>
  );
}
