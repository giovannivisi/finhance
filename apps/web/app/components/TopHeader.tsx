import Link from "next/link";
import Image from "next/image";

export default function TopHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "20px 40px",
        borderBottom: "1px solid var(--border-glass)",
        background: "rgba(5, 5, 5, 0.8)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <Link
        href="/"
        style={{ display: "flex", alignItems: "center", gap: "12px" }}
      >
        <Image
          src="/logo.png"
          alt="finhance logo"
          width={32}
          height={32}
          style={{ borderRadius: "8px", objectFit: "cover" }}
        />
        <span
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          finhance
        </span>
      </Link>
    </header>
  );
}
