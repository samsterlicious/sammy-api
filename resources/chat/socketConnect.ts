import { Handler, Context, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";

export const handler: Handler = async (
  event: APIGatewayEvent,
  context: Context
) => {
  const { TABLE_NAME } = process.env;
  const connectionId = event.requestContext.connectionId;
  if (connectionId && TABLE_NAME) {
    const dynamoDB = new DynamoDB.DocumentClient();
    await dynamoDB
      .put({
        TableName: TABLE_NAME,
        Item: {
          id: "Connection",
          sort_key: connectionId,
        },
      })
      .promise();
  }
};
