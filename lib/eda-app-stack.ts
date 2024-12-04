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

      // S3 Bucket
      const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          autoDeleteObjects: true,
      });

      // SQS Queues
      const imageProcessQueue = new sqs.Queue(this, 'img-created-queue', {
          receiveMessageWaitTime: cdk.Duration.seconds(10),
          deadLetterQueue: {
              maxReceiveCount: 5,
              queue: new sqs.Queue(this, 'img-created-dlq', {
                  queueName: 'img-created-dlq',
              }),
          },
      });

      const rejectionQueue = new sqs.Queue(this, 'RejectionQueue', {
          receiveMessageWaitTime: cdk.Duration.seconds(10),
          deadLetterQueue: {
              maxReceiveCount: 5,
              queue: new sqs.Queue(this, 'RejectionDLQ', {
                  queueName: 'rejection-dlq',
              }),
          },
      });

      // SNS Topic
      const newImageTopic = new sns.Topic(this, 'NewImageTopic', {
          displayName: 'New Image topic',
      });

      // Add Bucket Notification to SNS
      imagesBucket.addEventNotification(
          s3.EventType.OBJECT_CREATED,
          new s3n.SnsDestination(newImageTopic)
      );

      // SQS Subscriptions to SNS Topic
      newImageTopic.addSubscription(new subs.SqsSubscription(imageProcessQueue));
      newImageTopic.addSubscription(new subs.SqsSubscription(rejectionQueue));

  // Update Lambda Function for Processing Images
      const processImageFn = new lambdanode.NodejsFunction(this, 'ProcessImageFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
       handler: 'handler',
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
      BUCKET_NAME: imagesBucket.bucketName,
      REJECTION_QUEUE_URL: rejectionQueue.queueUrl,
  },
});

      // Update Lambda Function for Rejections
     const rejectionMailerFn = new lambdanode.NodejsFunction(this, 'RejectionMailerFn', {
     runtime: lambda.Runtime.NODEJS_18_X,
     entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
     handler: 'handler',
     timeout: cdk.Duration.seconds(10),
     memorySize: 128,
});

      // Add SQS Event Sources to Lambdas
      const sqsEventSource = new events.SqsEventSource(imageProcessQueue, {
          batchSize: 5,
          maxBatchingWindow: cdk.Duration.seconds(5),
      });
      processImageFn.addEventSource(sqsEventSource);

      const rejectionEventSource = new events.SqsEventSource(rejectionQueue, {
          batchSize: 5,
          maxBatchingWindow: cdk.Duration.seconds(5),
      });
      rejectionMailerFn.addEventSource(rejectionEventSource);

      // Grant Permissions
      imagesBucket.grantReadWrite(processImageFn);
      rejectionQueue.grantSendMessages(processImageFn);
      rejectionQueue.grantConsumeMessages(rejectionMailerFn);
  }
}