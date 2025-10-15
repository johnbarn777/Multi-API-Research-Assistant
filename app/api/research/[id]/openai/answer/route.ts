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
      nextQuestion: "Stub next question from OpenAI Deep Research session.",
      finalPrompt: null
    },
    { status: 200 }
  );
}
