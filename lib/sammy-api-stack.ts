import * as cdk from "@aws-cdk/core";
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as lambda from "@aws-cdk/aws-lambda";
import { AuthorizationType } from "@aws-cdk/aws-apigateway";
import * as cognito from "@aws-cdk/aws-cognito";
import * as acm from "@aws-cdk/aws-certificatemanager";
import * as route53 from "@aws-cdk/aws-route53";
import * as ssm from "@aws-cdk/aws-ssm";
import * as route53_targets from "@aws-cdk/aws-route53-targets";

export class SammyApiStack extends cdk.Stack {
  authorizer: apigateway.CognitoUserPoolsAuthorizer;
  restApi: apigateway.RestApi;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "MyHostedZone",
      {
        hostedZoneId,
        zoneName,
      }
    );

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: "api.sammy.link",
      validation: acm.CertificateValidation.fromDns(hostedZone),
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

    const method = this.restApi.root.addMethod(
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
              "method.response.header.Access-Control-Allow-Credentials": "'true'"
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
              "method.response.header.Access-Control-Allow-Credentials": true
            }
          }
        ]
      }
    );

    new route53.ARecord(this, "apiDNS", {
      zone: hostedZone,
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
  }

  createBudgetService() {
    const handler = new lambda.Function(this, "budgetHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("resources/budget"),
      handler: "index.handler",
      functionName: "budgetFinder",
    });

    const integration = new apigateway.LambdaIntegration(handler, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    this.restApi.root.addMethod("GET", integration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: this.authorizer,
    });
  }
}
