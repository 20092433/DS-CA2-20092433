import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // s3 bucket 
    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });



     // Integration infrastructure

     // sns topic
  const newImageTopic = new sns.Topic(this, "NewImageTopic", {
    displayName: "New Image topic",
  }); 

  //    sqs queues
  // const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
  //   receiveMessageWaitTime: cdk.Duration.seconds(5),
  // });


  

 //    sqs queues

   // Dead Letter Queue (DLQ)
   const deadLetterQueue = new sqs.Queue(this, 'DLQ', {
    retentionPeriod: cdk.Duration.days(14),
  });


  // Main Image Process Queue with DLQ configured
const imageProcessQueue = new sqs.Queue(this, 'ImageProcessQueue', {
  receiveMessageWaitTime: cdk.Duration.seconds(5),
  deadLetterQueue: {
    maxReceiveCount: 3, // Move to DLQ after 3 failed attempts
    queue: deadLetterQueue,
  },
});

// Mailer queue

const mailerQ = new sqs.Queue(this, "mailer-queue", {
  receiveMessageWaitTime: cdk.Duration.seconds(10),
});



  //dynamodb table
  const logImageTable = new dynamodb.Table(this, 'LogImageTable', {
    partitionKey: { name: 'fileName', type: dynamodb.AttributeType.STRING },
    removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
  });
  




  // Lambda functions

  const processImageFn = new lambdanode.NodejsFunction(
    this,
    "ProcessImageFn",
    {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
    }
  );

  const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(3),
    entry: `${__dirname}/../lambdas/mailer.ts`,
  });


  // rejection mailer lambda
  const rejectionMailerFn = new lambdanode.NodejsFunction(this, 'RejectionMailer', {
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
    environment: {
      SES_EMAIL_TO: process.env.SES_EMAIL_TO!,
      SES_EMAIL_FROM: process.env.SES_EMAIL_FROM!,
      SES_REGION: process.env.SES_REGION!,
    },
  });
  


 

  // S3 --> SQS
  imagesBucket.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new s3n.SnsDestination(newImageTopic)
  );


  // SNS subscriptions
  newImageTopic.addSubscription(
    new subs.SqsSubscription(mailerQ)
  );

  // add lambda as subscriber
  newImageTopic.addSubscription(
    new subs.LambdaSubscription(mailerFn)
  );

  

 // SQS --> Lambda
  const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(5),
  });


  const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(5),
  }); 


  mailerFn.addEventSource(newImageMailEventSource);

  processImageFn.addEventSource(newImageEventSource);

  // Permissions

  imagesBucket.grantRead(processImageFn);


  mailerFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    })
  );

  // Grant permissions for SES
rejectionMailerFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['ses:SendEmail', 'ses:SendRawEmail'],
  resources: ['*'],
}));

// Grant DLQ permissions
deadLetterQueue.grantConsumeMessages(rejectionMailerFn);

// allow lambda for image processing write to table
logImageTable.grantWriteData(processImageFn);



  // Output
  
  new cdk.CfnOutput(this, "bucketName", {
    value: imagesBucket.bucketName,
  });

   





  }
}
