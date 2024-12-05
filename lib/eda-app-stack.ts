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

      // Create the Dead Letter Queue
const processImageDLQ = new sqs.Queue(this, 'process-image-dlq', {
    retentionPeriod: cdk.Duration.days(14), // Retain messages for 14 days
});

// Create the Main Queue and attach the Dead Letter Queue
const imageProcessQueue = new sqs.Queue(this, 'img-created-queue', {
    receiveMessageWaitTime: cdk.Duration.seconds(19),
    deadLetterQueue: {
        queue: processImageDLQ, // Reference the Dead Letter Queue
        maxReceiveCount: 5,    // Maximum number of retries before moving to DLQ
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

      
      

       // DynamoDB Table
      const imageTable = new dynamodb.Table(this, 'ImageTable', {
      partitionKey: { name: 'fileName', type: dynamodb.AttributeType.STRING },
      tableName: 'ImageTable', // Explicitly set the table name
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Optional: Deletes table when stack is deleted
      });


      // Update Table Lambda
      const updateTableFn = new lambdanode.NodejsFunction(this, "UpdateTableFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "handler",
      entry: `${__dirname}/../lambdas/updateTable.ts`,
      environment: {
        DYNAMODB_TABLE_NAME: imageTable.tableName, // Pass table name as environment variable
      },
    });

    //Grant DynamoDB permissions to the Lambda function
    imageTable.grantWriteData(updateTableFn);



  // Update Lambda Function for Processing Images
      const processImageFn = new lambdanode.NodejsFunction(this, 'ProcessImageFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      handler: 'handler',
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
      BUCKET_NAME: imagesBucket.bucketName,
      DYNAMODB_TABLE_NAME: imageTable.tableName,
      DLQ_URL: processImageDLQ.queueUrl,
      
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



    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(12),
    entry: `${__dirname}/../lambdas/mailer.ts`,
  });

  //Subscribe Lambda to the SNS Topic with a Filter Policy
  newImageTopic.addSubscription(
    new subs.LambdaSubscription(updateTableFn, {
      filterPolicy: {
        metadata_type: sns.SubscriptionFilter.stringFilter({
          allowlist: ["Caption", "Date", "Photographer"],
        }),
      },
    })
  );

  
      // SQS Subscriptions to SNS Topic
      // newImageTopic.addSubscription(new subs.SqsSubscription(imageProcessQueue,
      //    {
      //   //   rawMessageDelivery: true,
      //     //filterPolicyScope: "MessageBody", // Apply the filter to the message body
      //     // filterPolicy: {
      //     //   source: sns.SubscriptionFilter.stringFilter({
      //     //     allowlist: ["Camera", "Phone"],
      //     //   }),
      //     //  }
      //    }));


         newImageTopic.addSubscription(
          new subs.SqsSubscription(imageProcessQueue, {
            filterPolicyWithMessageBody: {
              Records: sns.FilterOrPolicy.policy({
                s3: sns.FilterOrPolicy.policy({
                  object: sns.FilterOrPolicy.policy({
                    key: sns.FilterOrPolicy.filter(
                      sns.SubscriptionFilter.stringFilter({
                        matchPrefixes: ["image"], // Filter keys starting with "image"
                      })
                    ),
                  }),
                }),
              }),
            },
            //rawMessageDelivery: true,
          })
        );
        
      
      
      newImageTopic.addSubscription(new subs.LambdaSubscription(mailerFn));


      // Grant SES permissions to send emails
    rejectionMailerFn.addToRolePolicy(new iam.PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'], // Replace with a specific SES resource if necessary
    }));



      // Add SQS Event Sources to Lambdas
      const sqsEventSource = new events.SqsEventSource(imageProcessQueue, {
          batchSize: 1,
          maxBatchingWindow: cdk.Duration.seconds(5),
      });
      processImageFn.addEventSource(sqsEventSource);

      // Update rejection lambda to use the DLQ
      const dlqEventSource = new events.SqsEventSource(processImageDLQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
      });
      rejectionMailerFn.addEventSource(dlqEventSource);
      

      // Grant Permissions
      imagesBucket.grantReadWrite(processImageFn);
      imageTable.grantWriteData(processImageFn); // Grant write permissions to the table
      
      // Grant Permissions for DLQ
      // Grant permissions for the main queue and DLQ
        processImageDLQ.grantSendMessages(processImageFn);
        processImageDLQ.grantConsumeMessages(rejectionMailerFn); // If rejection mailer processes DLQ

      //processImageDLQ.grantSendMessages(processImageFn);

      


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
  }
}