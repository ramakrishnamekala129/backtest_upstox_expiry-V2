"use client";

export default function ErrorPage({
  error
}: {
  error: Error & { digest?: string };
}) {
  return (
    <main style={{ padding: 24, fontFamily: "Segoe UI, sans-serif" }}>
      <h1>Failed to load trend data</h1>
      <p>{error.message}</p>
      <p>
        Configure <code>TREND_DATA_URL</code> or <code>TREND_JSON_PATH</code>, or provide{" "}
        <code>public/trend_tables.json</code>.
      </p>
    </main>
  );
}
