import { Handler, Context, APIGatewayEvent } from "aws-lambda";

export const handler: Handler = async (
  event: APIGatewayEvent,
  context: Context
) => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      message: Math.floor(Math.random() * 10),
    }),
  };
};
