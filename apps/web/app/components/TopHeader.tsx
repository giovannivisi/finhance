import Link from "next/link";
import Image from "next/image";

export default function TopHeader() {
  return (
    <header className="top-header">
      <Link href="/" className="top-header-brand">
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
        <span className="top-header-wordmark">finhance</span>
      </Link>
    </header>
  );
}
