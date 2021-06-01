import { Handler, Context, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";

export const handler: Handler = async (
  event: APIGatewayEvent,
  context: Context
) => {
  const { TABLE_NAME } = process.env;
  if (event.body && TABLE_NAME) {
    const { user, date, text } = JSON.parse(event.body);
    if (user && date && text) {
      const dynamoDB = new DynamoDB.DocumentClient();
      await dynamoDB
        .put({
          TableName: TABLE_NAME,
          Item: {
            id: "Message",
            sort_key: date,
            user,
            text,
          },
        })
        .promise();
    }
  }
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      message: "success",
    }),
  };
};
