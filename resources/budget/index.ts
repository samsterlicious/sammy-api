import { Handler, Context, APIGatewayEvent } from "aws-lambda";
import { S3 } from 'aws-sdk';

export const handler: Handler = async (
  event: APIGatewayEvent,
  context: Context
) => {
  if (event.queryStringParameters) {
    const { month, year } = event.queryStringParameters;
    const {BUCKET_NAME} = process.env;
    const s3 = new S3();

    const url = s3.getSignedUrl("getObject", {
      Bucket: BUCKET_NAME,
      Key: `${year}/${month}.csv`,
      Expires: 60,
    })
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        url,
      }),
    };
  } else {
    return {
      statusCode: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "bad request",
      }),
    };
  }
};
