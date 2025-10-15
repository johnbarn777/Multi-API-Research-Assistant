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
      ok: true,
      message: "Parallel OpenAI + Gemini execution stub initiated."
    },
    { status: 202 }
  );
}
