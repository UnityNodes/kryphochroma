import { ClientTable } from "@/components/table/ClientTable";

const MIN_SEATS = 2;
const MAX_SEATS = 4;
const DEFAULT_SEATS = 4;

export default async function PlayPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requested = Number(params.seats);
  const seats = Number.isInteger(requested) && requested >= MIN_SEATS && requested <= MAX_SEATS ? requested : DEFAULT_SEATS;
  return <ClientTable seats={seats} stackDrawTwo={params.stack === "1"} />;
}
