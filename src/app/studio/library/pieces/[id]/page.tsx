import { PiecePage } from "./piece-page";

export const metadata = { title: "Piece" };

export default function Page({ params }: { params: { id: string } }) {
  return <PiecePage id={params.id} />;
}
