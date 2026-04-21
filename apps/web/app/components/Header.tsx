import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full bg-white shadow-sm">
      <div className="w-full px-8 py-6 flex items-center justify-between gap-6">
        <Link
          href="/"
          className="text-4xl font-extrabold tracking-tight text-gray-900"
        >
          finhance
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
          <Link href="/" className="hover:text-gray-900">
            Dashboard
          </Link>
          <Link href="/transactions" className="hover:text-gray-900">
            Transactions
          </Link>
          <Link href="/recurring" className="hover:text-gray-900">
            Recurring
          </Link>
          <Link href="/review" className="hover:text-gray-900">
            Review
          </Link>
          <Link href="/history" className="hover:text-gray-900">
            History
          </Link>
          <Link href="/accounts" className="hover:text-gray-900">
            Accounts
          </Link>
          <Link href="/categories" className="hover:text-gray-900">
            Categories
          </Link>
        </nav>
      </div>
    </header>
  );
}
