import { NextResponse } from "next/server";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  return NextResponse.json(
    {
      id: params.id,
      message: "Fetch single research placeholder.",
      status: "awaiting_refinements"
    },
    { status: 200 }
  );
}
