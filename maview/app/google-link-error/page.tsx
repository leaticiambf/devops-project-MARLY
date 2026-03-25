import { GoogleLinkErrorClient } from "./google-link-error-client";

export default async function GoogleLinkErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return <GoogleLinkErrorClient error={error} />;
}
