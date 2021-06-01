import * as cdk from "@aws-cdk/core";
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as lambda from "@aws-cdk/aws-lambda";
import { AuthorizationType, DomainName } from "@aws-cdk/aws-apigateway";
import * as cognito from "@aws-cdk/aws-cognito";
import * as acm from "@aws-cdk/aws-certificatemanager";
import * as route53 from "@aws-cdk/aws-route53";
import * as ssm from "@aws-cdk/aws-ssm";
import * as route53_targets from "@aws-cdk/aws-route53-targets";
import * as s3 from "@aws-cdk/aws-s3";
import * as logs from "@aws-cdk/aws-logs";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { DynamoEventSource } from "@aws-cdk/aws-lambda-event-sources";
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2";
import * as apiv2integrations from "@aws-cdk/aws-apigatewayv2-integrations";

export class SammyApiStack extends cdk.Stack {
  authorizer: apigateway.CognitoUserPoolsAuthorizer;
  restApi: apigateway.RestApi;
  table: dynamodb.Table;
  hostedZone: route53.IHostedZone; 
  websocketStage: apigatewayv2.WebSocketStage

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    let dynamoLambdas:lambda.Function[] = [];

    this.table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sort_key", type: dynamodb.AttributeType.STRING },
      readCapacity: 1,
      writeCapacity: 1,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    }); 
    this.createWebsocket(this);
    this.addDynamoLambdaIntegration(dynamoLambdas);

    const hostedZoneId = ssm.StringParameter.fromStringParameterAttributes(
      this,
      "HostedZoneIdParam",
      {
        parameterName: "hosted_zone_id",
      }
    ).stringValue;

    const zoneName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      "ZoneNameParam",
      {
        parameterName: "zone_name",
      }
    ).stringValue;

    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "MyHostedZone",
      {
        hostedZoneId,
        zoneName,
      }
    );

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: "api.sammy.link",
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    this.restApi = new apigateway.RestApi(this, "apigateway", {
      restApiName: "Sammy Service",
      description: "api yo",
      domainName: {
        domainName: "api.sammy.link",
        certificate,
        endpointType: apigateway.EndpointType.REGIONAL,
      },
    });

    new route53.ARecord(this, "apiDNS", {
      zone: this.hostedZone,
      recordName: "api",
      target: route53.RecordTarget.fromAlias(
        new route53_targets.ApiGateway(this.restApi)
      ),
    });

    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      "UserPool",
      "us-east-1_gmZ6kAJzv"
    );

    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "authorizer",
      {
        cognitoUserPools: [userPool],
        authorizerName: "cognito-authorizer",
      }
    );

    this.createBudgetService();
    this.createChatService();
  }

  createBudgetService() {
    const billingBucket = new s3.Bucket(this, "BillingBucket", {
      bucketName: "sammy-billing-bucket",
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const handler = new lambda.Function(this, "budgetHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources/budget"),
      handler: "index.handler",
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        BUCKET_NAME: billingBucket.bucketName,
      },
    });

    const integration = new apigateway.LambdaIntegration(handler, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    const budget = this.restApi.root.addResource("budget");

    budget.addMethod("GET", integration, {});
  }

  createChatService() {
    const handler = new lambda.Function(this, "chatHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources/chat"),
      handler: "index.handler",
      logRetention: logs.RetentionDays.ONE_DAY,

      environment: {
        TABLE_NAME: this.table.tableName,
      },
    });

    const integration = new apigateway.LambdaIntegration(handler, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    const chat = this.restApi.root.addResource("chat");

    this.addCors(chat);

    chat.addMethod("POST", integration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: this.authorizer,
    });

    this.table.grantReadWriteData(handler);
  }

  addCors(resource: apigateway.Resource) {
    resource.addMethod(
      "OPTIONS",
      new apigateway.MockIntegration({
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Headers":
                "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              "method.response.header.Access-Control-Allow-Methods":
                "'GET,POST,OPTIONS'",
              "method.response.header.Access-Control-Allow-Origin": "'*'",
              "method.response.header.Access-Control-Allow-Credentials":
                "'true'",
            },
            responseTemplates: {
              "application/json": "",
            },
          },
        ],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          "application/json": '{"statusCode": 200}',
        },
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
              "method.response.header.Access-Control-Allow-Headers": true,
              "method.response.header.Access-Control-Allow-Methods": true,
              "method.response.header.Access-Control-Allow-Credentials": true,
            },
          },
        ],
      }
    );
  }

  createWebsocket(stack: cdk.Stack) { 
 
    const webSocketApi = new apigatewayv2.WebSocketApi(stack, "websocketapi", { 
    }); 
    // const certificate = new acm.Certificate(this, "WebSocketCertificate", {
    //   domainName: "websocket.sammy.link",
    //   validation: acm.CertificateValidation.fromDns(this.hostedZone),
    // });

    // this.websocketDomain = new apigatewayv2.DomainName(
    //   stack,
    //   "WebsocketDomainName",
    //   {
    //     domainName: "ws.sammy.link",
    //     certificate,
    //   }
    // );

    this.websocketStage = new apigatewayv2.WebSocketStage(stack, "WebsocketStage", {
      webSocketApi,
      stageName: "prod",
      autoDeploy: true, 
    });   
  }

  addDynamoLambdaIntegration(lambdas: lambda.Function[]) {
    lambdas.forEach(lambda=>{
      this.table.grantReadWriteData(lambda);
    })
  }
}
