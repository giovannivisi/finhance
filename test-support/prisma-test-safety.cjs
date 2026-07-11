const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function assertLocalPrismaTestDatabaseUrl(databaseUrl) {
  let url;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      "Prisma integration tests require a valid local DATABASE_URL.",
    );
  }

  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      `Refusing to run Prisma integration tests against non-local database host "${url.hostname}".`,
    );
  }
}

exports.assertLocalPrismaTestDatabaseUrl = assertLocalPrismaTestDatabaseUrl;
