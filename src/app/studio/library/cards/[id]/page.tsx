import { CardPage } from "./card-page";

export const metadata = { title: "Card" };

export default function Page({ params }: { params: { id: string } }) {
  return <CardPage id={params.id} />;
}
