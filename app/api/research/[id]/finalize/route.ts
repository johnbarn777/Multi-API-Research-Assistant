import { NextResponse } from "next/server";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(_: Request, { params }: Params) {
  return NextResponse.json(
    {
      id: params.id,
      emailed: false,
      message: "Finalize stub. Will assemble PDF and send email."
    },
    { status: 202 }
  );
}
