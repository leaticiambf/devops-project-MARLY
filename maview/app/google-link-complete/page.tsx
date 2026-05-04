import { GoogleLinkCompleteClient } from "./google-link-complete-client";

export default async function GoogleLinkCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : null;
  const name = typeof params.name === "string" ? params.name : null;

  return <GoogleLinkCompleteClient email={email} name={name} />;
}
